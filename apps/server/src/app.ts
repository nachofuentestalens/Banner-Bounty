import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  PartyFormationRequestSchema,
  SelectSessionRequestSchema,
  NoPayloadMutationRequestSchema,
  ArenaChallengeRequestSchema,
  ArenaSnapshotsQuerySchema,
  EquipRequestSchema,
  UnequipRequestSchema,
  HeroRecruitRequestSchema,
  SecondaryClassRequestSchema,
  LoadoutRequestSchema,
  CraftRequestSchema,
  ReforgeRequestSchema,
  DungeonStartRequestSchema,
  AreaSelectRequestSchema,
  type Account,
} from "@banner-and-bounty/contracts";
import { MAX_BODY_BYTES } from "@banner-and-bounty/contracts";
import { ZodError } from "zod";
import { openDatabase } from "./db/connection.js";
import { runMigrations, currentSchemaVersion } from "./db/migrations.js";
import { seedAccounts } from "./db/seed.js";
import { SystemClock, type Clock } from "./clock.js";
import { AppError, ERROR_STATUS, toErrorDTO } from "./errors.js";
import { AccountRepository } from "./repositories/accountRepository.js";
import { SessionRepository } from "./repositories/sessionRepository.js";
import { SessionService } from "./services/sessionService.js";
import { buildAccountState } from "./services/accountStateService.js";
import { applyPartyFormation } from "./services/partyFormationService.js";
import { listAreas, selectArea } from "./services/areaService.js";
import { publishSnapshot, listSnapshotSummaries, getSnapshotDetail, challenge } from "./services/arenaService.js";
import { getOwnedReport } from "./services/battleReportService.js";
import { equip, unequip } from "./services/equipmentService.js";
import { recruitHero, assignSecondaryClass, setLoadout } from "./services/heroService.js";
import { craftItem, reforgeItem } from "./services/craftingService.js";
import { startDungeon, settleDungeon, stopDungeon } from "./services/dungeonService.js";
import { settleExpedition, startExpedition, stopExpedition } from "./services/expeditionService.js";
import { challengeBoss } from "./services/bossService.js";
import { registerStaticClient } from "./http/staticClient.js";
import { SESSION_COOKIE_NAME, parseCookies, serializeSessionCookie, serializeClearedSessionCookie } from "./http/cookies.js";

export interface BuildServerOptions {
  dbPath?: string;
  db?: DatabaseSync;
  clock?: Clock;
  /** Built apps/web dist directory to serve; omitted in tests and `npm run dev` (Vite serves the UI). */
  webDistDir?: string | undefined;
}

declare module "fastify" {
  interface FastifyRequest {
    accountId?: string | undefined;
    sessionId?: string | undefined;
  }
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const db = options.db ?? openDatabase(options.dbPath ?? ":memory:");
  const clock = options.clock ?? new SystemClock();
  runMigrations(db);
  seedAccounts(db, clock);

  const app = Fastify({ logger: false, bodyLimit: MAX_BODY_BYTES });

  const accounts = new AccountRepository(db);
  const sessions = new SessionRepository(db);
  const sessionService = new SessionService(accounts, sessions, clock);

  // Correlation ID + session resolution. Logs never include session secrets
  // (architecture.md: "Log a correlation ID, not session secrets").
  app.addHook("onRequest", async (request: FastifyRequest) => {
    const cookies = parseCookies(request.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE_NAME];
    request.sessionId = sessionId;
    const account: Account | null = sessionService.resolveAccount(sessionId);
    request.accountId = account?.accountId;
  });

  function requireSession(request: FastifyRequest): string {
    if (!request.accountId) {
      throw new AppError("unauthenticated", "a session cookie is required for this endpoint");
    }
    return request.accountId;
  }

  app.setErrorHandler((error: unknown, request, reply: FastifyReply) => {
    const correlationId = crypto.randomUUID();
    if (error instanceof AppError) {
      reply.status(ERROR_STATUS[error.code]).send({ ok: false, error: toErrorDTO(error, correlationId) });
      return;
    }
    if (error instanceof ZodError) {
      reply.status(ERROR_STATUS.validation).send({
        ok: false,
        error: { code: "validation", message: "invalid request payload", correlationId },
      });
      return;
    }
    const fastifyError = error as { statusCode?: number; code?: string };
    if (fastifyError.statusCode === 413 || fastifyError.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      reply.status(ERROR_STATUS.validation).send({
        ok: false,
        error: { code: "validation", message: "request body exceeds the size limit", correlationId },
      });
      return;
    }
    if (typeof fastifyError.code === "string" && fastifyError.code.startsWith("FST_ERR_CTP_")) {
      reply.status(ERROR_STATUS.validation).send({
        ok: false,
        error: { code: "validation", message: "invalid request payload", correlationId },
      });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(`[server] internal error (correlationId=${correlationId})`, error);
    reply.status(ERROR_STATUS.internal).send({
      ok: false,
      error: { code: "internal", message: "internal error", correlationId },
    });
  });

  app.get("/health", async () => ({
    ok: true,
    data: { status: "ok", schemaVersion: currentSchemaVersion(db) },
  }));

  app.post("/dev/session/select", async (request, reply) => {
    const body = SelectSessionRequestSchema.parse(request.body);
    const { sessionId, account } = sessionService.selectAccount(body.accountSlot);
    reply.header("set-cookie", serializeSessionCookie(sessionId));
    return { ok: true, data: { accountId: account.accountId, displayName: account.displayName } };
  });

  app.get("/dev/session/current", async (request) => {
    const accountId = requireSession(request);
    const account = accounts.findById(accountId);
    if (!account) throw new AppError("unauthenticated", "session account no longer exists");
    return { ok: true, data: { accountId: account.accountId, displayName: account.displayName } };
  });

  app.post("/dev/session/logout", async (request, reply) => {
    requireSession(request);
    if (request.sessionId) sessionService.logout(request.sessionId);
    reply.header("set-cookie", serializeClearedSessionCookie());
    return { ok: true, data: {} };
  });

  app.get("/account/state", async (request) => {
    const accountId = requireSession(request);
    const { data } = buildAccountState(db, accountId);
    return { ok: true, data, revision: data.revision };
  });

  app.patch("/party/formation", async (request) => {
    const accountId = requireSession(request);
    const body = PartyFormationRequestSchema.parse(request.body);
    const { result, revision } = applyPartyFormation(db, accountId, body);
    return { ok: true, data: result, revision };
  });

  // Loadout, expedition and boss (M1-08). Every route is a runMutation
  // service call; the route only resolves the session and parses the body.
  app.post("/equipment/equip", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = equip(db, accountId, EquipRequestSchema.parse(request.body));
    return { ok: true, data: result, revision };
  });

  app.post("/equipment/unequip", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = unequip(db, accountId, UnequipRequestSchema.parse(request.body));
    return { ok: true, data: result, revision };
  });

  // M2-25: roster, dual class and skill loadout.
  app.post("/hero/recruit", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = recruitHero(db, accountId, HeroRecruitRequestSchema.parse(request.body));
    return { ok: true, data: result, revision };
  });

  app.post("/hero/secondary-class", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = assignSecondaryClass(db, accountId, SecondaryClassRequestSchema.parse(request.body));
    return { ok: true, data: result, revision };
  });

  app.patch("/hero/loadout", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = setLoadout(db, accountId, LoadoutRequestSchema.parse(request.body));
    return { ok: true, data: result, revision };
  });

  // M2-25: crafting and reforging.
  app.post("/craft", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = craftItem(db, accountId, CraftRequestSchema.parse(request.body));
    return { ok: true, data: result, revision };
  });

  app.post("/reforge", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = reforgeItem(db, accountId, ReforgeRequestSchema.parse(request.body));
    return { ok: true, data: result, revision };
  });

  // M2-01: area selection.
  app.get("/areas", async (request) => {
    const accountId = requireSession(request);
    return { ok: true, data: { areas: listAreas(db, accountId) } };
  });

  app.post("/area/select", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = selectArea(db, accountId, AreaSelectRequestSchema.parse(request.body));
    return { ok: true, data: result, revision };
  });

  // M2-25: dungeon runs.
  app.post("/dungeon/start", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = startDungeon(db, accountId, DungeonStartRequestSchema.parse(request.body), clock);
    return { ok: true, data: result, revision };
  });

  app.post("/dungeon/settle", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = settleDungeon(db, accountId, NoPayloadMutationRequestSchema.parse(request.body), clock);
    return { ok: true, data: result, revision };
  });

  app.post("/dungeon/stop", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = stopDungeon(db, accountId, NoPayloadMutationRequestSchema.parse(request.body), clock);
    return { ok: true, data: result, revision };
  });

  app.post("/expedition/start", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = startExpedition(db, accountId, NoPayloadMutationRequestSchema.parse(request.body), clock);
    return { ok: true, data: result, revision };
  });

  app.post("/expedition/settle", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = settleExpedition(db, accountId, NoPayloadMutationRequestSchema.parse(request.body), clock);
    return { ok: true, data: result, revision };
  });

  app.post("/expedition/stop", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = stopExpedition(db, accountId, NoPayloadMutationRequestSchema.parse(request.body), clock);
    return { ok: true, data: result, revision };
  });

  app.post("/boss/challenge", async (request) => {
    const accountId = requireSession(request);
    const { result, revision } = challengeBoss(db, accountId, NoPayloadMutationRequestSchema.parse(request.body), clock);
    return { ok: true, data: result, revision };
  });

  // Arena (design/studio/contracts.md "Arena, boss, and migration
  // invariants"; design/game/combat.md). Publish/challenge are session-only
  // mutations; the two snapshot reads are public, since previewing a
  // published opponent before challenging must work without the defender
  // online.
  app.post("/arena/publish", async (request) => {
    const accountId = requireSession(request);
    const body = NoPayloadMutationRequestSchema.parse(request.body);
    const { result, revision } = publishSnapshot(db, accountId, body, clock);
    return { ok: true, data: result, revision };
  });

  app.get("/arena/snapshots", async (request) => {
    const query = ArenaSnapshotsQuerySchema.parse(request.query);
    const snapshots = listSnapshotSummaries(db, request.accountId, query.excludeMine);
    return { ok: true, data: { snapshots } };
  });

  app.get("/arena/snapshots/:snapshotId", async (request) => {
    const { snapshotId } = request.params as { snapshotId: string };
    const snapshot = getSnapshotDetail(db, snapshotId);
    return { ok: true, data: { snapshot } };
  });

  app.post("/arena/challenge", async (request) => {
    const accountId = requireSession(request);
    const body = ArenaChallengeRequestSchema.parse(request.body);
    const { result, revision } = challenge(db, accountId, body, clock);
    return { ok: true, data: result, revision };
  });

  app.get("/battle-reports/:reportId", async (request) => {
    const accountId = requireSession(request);
    const { reportId } = request.params as { reportId: string };
    const report = getOwnedReport(db, accountId, reportId);
    return { ok: true, data: { report } };
  });

  registerStaticClient(app, options.webDistDir);

  app.addHook("onClose", async () => {
    db.close();
  });

  return app;
}
