import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { autoFillLoadout } from "@banner-and-bounty/content";
import { buildServer } from "./app.js";
import { openDatabase } from "./db/connection.js";
import { HeroRepository } from "./repositories/heroRepository.js";
import { PartyFormationRepository } from "./repositories/partyFormationRepository.js";
import { SEED_ACCOUNT_A_ID, SEED_ACCOUNT_B_ID } from "./db/seed.js";

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!header) throw new Error("no set-cookie header returned");
  return header.split(";")[0] ?? "";
}

async function selectSlot(app: ReturnType<typeof buildServer>, slot: "A" | "B") {
  const response = await app.inject({ method: "POST", url: "/dev/session/select", payload: { accountSlot: slot } });
  return extractCookie(response.headers["set-cookie"]);
}

/** Seeds a complete, ownable 3-hero party (one of each class) for an account. */
function seedParty(db: ReturnType<typeof openDatabase>, accountId: string): [string, string, string] {
  const heroes = new HeroRepository(db);
  const ids: [string, string, string] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const classes = ["class_vanguard", "class_ranger", "class_arcanist"] as const;
  ids.forEach((heroId, i) => {
    heroes.insertForFixture({
      heroId,
      accountId,
      primaryClassId: classes[i],
      secondaryClassId: null,
      level: 1,
      xp: 0,
      skillLoadout: autoFillLoadout(classes[i], 1),
      equipment: { weapon: null, armor: null, trinket: null },
    });
  });
  new PartyFormationRepository(db).upsert(accountId, [ids[0], ids[1], ids[2], null, null]);
  return ids;
}

describe("arena: publish, list, challenge, and battle reports (M1-11)", () => {
  it("two accounts publish and challenge without the defender online; only intended public fields are exposed", async () => {
    const db = openDatabase(":memory:");
    const app = buildServer({ db });
    seedParty(db, SEED_ACCOUNT_A_ID);
    seedParty(db, SEED_ACCOUNT_B_ID);

    const cookieB = await selectSlot(app, "B");
    const publish = await app.inject({
      method: "POST",
      url: "/arena/publish",
      headers: { cookie: cookieB },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0 },
    });
    expect(publish.statusCode).toBe(200);
    const snapshotId: string = publish.json().data.snapshot.snapshotId;

    // Defender (B) is never contacted again below: no B cookie is used for
    // list/detail/challenge, simulating the defender being offline.
    const list = await app.inject({ method: "GET", url: "/arena/snapshots" });
    expect(list.statusCode).toBe(200);
    const summary = list.json().data.snapshots.find((s: { snapshotId: string }) => s.snapshotId === snapshotId);
    expect(summary).toBeDefined();
    expect(Object.keys(summary)).toEqual(
      expect.arrayContaining(["snapshotId", "accountId", "publishedAt", "rulesVersion", "heroClasses"]),
    );
    expect(summary.gold).toBeUndefined();
    expect(summary.inventory).toBeUndefined();
    expect(summary.frozenStats).toBeUndefined();

    const detail = await app.inject({ method: "GET", url: `/arena/snapshots/${snapshotId}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.snapshot.frozenParty).toHaveLength(3);
    expect(detail.json().data.snapshot.frozenStats).toHaveLength(3);
    expect(detail.json().data.snapshot.gold).toBeUndefined();

    const cookieA = await selectSlot(app, "A");
    const challengeResp = await app.inject({
      method: "POST",
      url: "/arena/challenge",
      headers: { cookie: cookieA },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, snapshotId },
    });
    expect(challengeResp.statusCode).toBe(200);
    const report = challengeResp.json().data.report;
    expect(["win", "loss", "draw"]).toContain(report.result.outcome);
    expect(report.kind).toBe("arena");
    expect(typeof report.seed).toBe("string");
    expect(report.rulesVersion).toBe(1);

    // Challenging never mutates the opponent's (B's) live account: B's
    // revision reflects only B's own publish call (1), not A's challenge.
    const bState = await app.inject({ method: "GET", url: "/account/state", headers: { cookie: await selectSlot(app, "B") } });
    expect(bState.json().data.revision).toBe(1);

    await app.close();
  });

  it("changing the defender's gear/spec later cannot alter the stored snapshot or report; reopening a save preserves reports", async () => {
    const dbPath = (await import("node:fs")).mkdtempSync(
      (await import("node:path")).join((await import("node:os")).tmpdir(), "bb-m111-"),
    );
    const path = await import("node:path");
    const file = path.join(dbPath, "save.sqlite");

    let db = openDatabase(file);
    let app = buildServer({ db });
    seedParty(db, SEED_ACCOUNT_A_ID);
    const [heroB1] = seedParty(db, SEED_ACCOUNT_B_ID);

    const cookieB = await selectSlot(app, "B");
    const publish = await app.inject({
      method: "POST",
      url: "/arena/publish",
      headers: { cookie: cookieB },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0 },
    });
    const snapshotId: string = publish.json().data.snapshot.snapshotId;
    const statsBefore = publish.json().data.snapshot.frozenStats;

    const cookieA = await selectSlot(app, "A");
    const challenge = await app.inject({
      method: "POST",
      url: "/arena/challenge",
      headers: { cookie: cookieA },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0, snapshotId },
    });
    const reportId: string = challenge.json().data.report.reportId;
    const reportBefore = challenge.json().data.report;

    // Mutate B's hero directly (simulating a later level-up/gear change
    // with no update endpoint yet wired) and confirm the snapshot/report are untouched.
    db.prepare("UPDATE heroes SET level = 10, secondaryClassId = 'class_rogue' WHERE heroId = ?").run(heroB1);

    const detailAfterMutation = await app.inject({ method: "GET", url: `/arena/snapshots/${snapshotId}` });
    expect(detailAfterMutation.json().data.snapshot.frozenStats).toEqual(statsBefore);

    const reportAfterMutation = await app.inject({
      method: "GET",
      url: `/battle-reports/${reportId}`,
      headers: { cookie: cookieA },
    });
    expect(reportAfterMutation.json().data.report).toEqual(reportBefore);

    await app.close();

    // Reopen the save file: migrations re-run as a no-op, and the
    // previously-created report/snapshot are still readable identically.
    db = openDatabase(file);
    app = buildServer({ db });
    const cookieA2 = await selectSlot(app, "A");
    const reportAfterReopen = await app.inject({
      method: "GET",
      url: `/battle-reports/${reportId}`,
      headers: { cookie: cookieA2 },
    });
    expect(reportAfterReopen.statusCode).toBe(200);
    expect(reportAfterReopen.json().data.report).toEqual(reportBefore);

    const detailAfterReopen = await app.inject({ method: "GET", url: `/arena/snapshots/${snapshotId}` });
    expect(detailAfterReopen.json().data.snapshot.frozenStats).toEqual(statsBefore);

    await app.close();
    (await import("node:fs")).rmSync(dbPath, { recursive: true, force: true });
  });

  it("retries are idempotent, foreign private report retrieval is rejected, and a missing snapshot is not_found", async () => {
    const db = openDatabase(":memory:");
    const app = buildServer({ db });
    seedParty(db, SEED_ACCOUNT_A_ID);
    seedParty(db, SEED_ACCOUNT_B_ID);

    const cookieB = await selectSlot(app, "B");
    const publish = await app.inject({
      method: "POST",
      url: "/arena/publish",
      headers: { cookie: cookieB },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0 },
    });
    const snapshotId: string = publish.json().data.snapshot.snapshotId;

    const cookieA = await selectSlot(app, "A");
    const requestId = crypto.randomUUID();
    const payload = { requestId, expectedRevision: 0, snapshotId };

    const first = await app.inject({ method: "POST", url: "/arena/challenge", headers: { cookie: cookieA }, payload });
    expect(first.statusCode).toBe(200);
    const retry = await app.inject({ method: "POST", url: "/arena/challenge", headers: { cookie: cookieA }, payload });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());

    const reportId = first.json().data.report.reportId;
    const foreignRead = await app.inject({
      method: "GET",
      url: `/battle-reports/${reportId}`,
      headers: { cookie: cookieB },
    });
    expect(foreignRead.statusCode).toBe(404);
    expect(foreignRead.json().error.code).toBe("not_found");

    const missingSnapshot = await app.inject({
      method: "POST",
      url: "/arena/challenge",
      headers: { cookie: cookieA },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 1, snapshotId: "does-not-exist" },
    });
    expect(missingSnapshot.statusCode).toBe(404);
    expect(missingSnapshot.json().error.code).toBe("not_found");

    const missingDetail = await app.inject({ method: "GET", url: "/arena/snapshots/does-not-exist" });
    expect(missingDetail.statusCode).toBe(404);

    await app.close();
  });

  it("publishing requires a complete 3-hero party", async () => {
    const db = openDatabase(":memory:");
    const app = buildServer({ db });
    // Accounts are seeded with a starter party (M1-08); remove it to model a save without one.
    db.prepare("DELETE FROM party_formations WHERE accountId = ?").run(SEED_ACCOUNT_A_ID);
    const cookieA = await selectSlot(app, "A"); // no party order set
    const publish = await app.inject({
      method: "POST",
      url: "/arena/publish",
      headers: { cookie: cookieA },
      payload: { requestId: crypto.randomUUID(), expectedRevision: 0 },
    });
    expect(publish.statusCode).toBe(400);
    expect(publish.json().error.code).toBe("validation");
    await app.close();
  });
});
