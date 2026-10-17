// Frozen contract surface (design/studio/contracts.md). Imports nothing from
// apps/server, apps/web, or node:sqlite per architecture.md. M1-07 implements
// the full DTO/Zod surface here; service logic for endpoints owned by later
// tasks (M1-08 progression/equipment, M1-11 arena) lives in apps/server once
// those tasks land, reusing the schemas declared here.
import { z } from "zod";

export const contractsPackageVersion = "0.1.0" as const;

// ---------------------------------------------------------------------------
// Error contract
// ---------------------------------------------------------------------------

export const ErrorCodeSchema = z.enum([
  "validation",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "active_expedition",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export interface ErrorDTO {
  code: ErrorCode;
  message: string;
  correlationId: string;
  details?: Record<string, unknown>;
}

export interface OkEnvelope<T> {
  ok: true;
  data: T;
  revision?: number;
}

export interface ErrEnvelope {
  ok: false;
  error: ErrorDTO;
}

export type Envelope<T> = OkEnvelope<T> | ErrEnvelope;

// ---------------------------------------------------------------------------
// Bounded-input primitives (design/studio/contracts.md "Conventions")
// ---------------------------------------------------------------------------

export const MAX_STRING_LENGTH = 256;
export const MAX_ARRAY_LENGTH = 64;
export const MAX_BODY_BYTES = 16 * 1024;

const boundedString = (max = MAX_STRING_LENGTH) => z.string().min(1).max(max);
const uuidV4 = () => z.string().uuid();

export const RequestIdSchema = uuidV4();
export const RevisionSchema = z.number().int().min(0);

const MutationEnvelopeShape = {
  requestId: RequestIdSchema,
  expectedRevision: RevisionSchema,
};

// ---------------------------------------------------------------------------
// Entities (server-owned; not raw DB rows)
// ---------------------------------------------------------------------------

export type AccountId = string;
export type HeroId = string;
export type ItemInstanceId = string;
export type SnapshotId = string;
export type ReportId = string;

export interface Account {
  accountId: AccountId;
  displayName: string;
  createdAt: string;
}

// Session is cookie-only and never serialized into a JSON response body.
export interface Session {
  sessionId: string;
  accountId: AccountId;
  createdAt: string;
}

export type EquipmentSlot = "weapon" | "armor" | "trinket";

export interface HeroEquipment {
  weapon: ItemInstanceId | null;
  armor: ItemInstanceId | null;
  trinket: ItemInstanceId | null;
}

export interface Hero {
  heroId: HeroId;
  accountId: AccountId;
  classId: string;
  level: number;
  xp: number;
  specializationId: string | null;
  equipment: HeroEquipment;
}

export interface ItemInstance {
  itemInstanceId: ItemInstanceId;
  accountId: AccountId;
  definitionId: string;
  affixId: string | null;
  equippedBy: HeroId | null;
}

export interface PartyOrder {
  accountId: AccountId;
  order: [HeroId, HeroId, HeroId];
}

export type ExpeditionStatus = "none" | "active";

export interface Expedition {
  accountId: AccountId;
  status: ExpeditionStatus;
  startedAt: string | null;
  checkpointAt: string | null;
  subCycleRemainderMs: number;
  frozenLoadout: unknown | null;
  rulesVersion: number | null;
  rngState: string | null;
  cyclesCompleted: number;
}

export interface BossClaim {
  accountId: AccountId;
  bossId: string;
  claimedAt: string | null;
}

export interface TeamSnapshot {
  snapshotId: SnapshotId;
  accountId: AccountId;
  publishedAt: string;
  rulesVersion: number;
  frozenParty: unknown;
  frozenStats: unknown;
}

export type BattleReportKind = "pve" | "boss" | "arena";

export interface BattleReport {
  reportId: ReportId;
  kind: BattleReportKind;
  participantsSnapshot: unknown;
  seed: string;
  rulesVersion: number;
  events: unknown[];
  result: unknown;
  createdAt: string;
}

export interface IdempotencyReceipt {
  accountId: AccountId;
  command: string;
  requestId: string;
  fingerprint: string;
  resultPayload: unknown;
  createdAt: string;
}

export interface SchemaVersionRow {
  version: number;
  appliedAt: string;
}

// ---------------------------------------------------------------------------
// Endpoint request schemas (payload validation only; implemented in
// apps/server by the task that owns each endpoint's service logic)
// ---------------------------------------------------------------------------

export const AccountSlotSchema = z.enum(["A", "B"]);
export type AccountSlot = z.infer<typeof AccountSlotSchema>;

export const SelectSessionRequestSchema = z.object({
  accountSlot: AccountSlotSchema,
});
export type SelectSessionRequest = z.infer<typeof SelectSessionRequestSchema>;

export const PartyOrderRequestSchema = z.object({
  ...MutationEnvelopeShape,
  order: z
    .tuple([boundedString(64), boundedString(64), boundedString(64)])
    .refine((order) => new Set(order).size === order.length, {
      message: "order must contain three distinct hero IDs",
    }),
});
export type PartyOrderRequest = z.infer<typeof PartyOrderRequestSchema>;

export const EquipSlotSchema = z.enum(["weapon", "armor", "trinket"]);

export const EquipRequestSchema = z.object({
  ...MutationEnvelopeShape,
  heroId: boundedString(64),
  itemInstanceId: boundedString(64),
  slot: EquipSlotSchema,
});
export type EquipRequest = z.infer<typeof EquipRequestSchema>;

export const UnequipRequestSchema = z.object({
  ...MutationEnvelopeShape,
  heroId: boundedString(64),
  slot: EquipSlotSchema,
});
export type UnequipRequest = z.infer<typeof UnequipRequestSchema>;

export const SpecializationRequestSchema = z.object({
  ...MutationEnvelopeShape,
  heroId: boundedString(64),
  specializationId: boundedString(64),
});
export type SpecializationRequest = z.infer<typeof SpecializationRequestSchema>;

export const NoPayloadMutationRequestSchema = z.object({
  ...MutationEnvelopeShape,
});
export type NoPayloadMutationRequest = z.infer<typeof NoPayloadMutationRequestSchema>;

export const ArenaChallengeRequestSchema = z.object({
  ...MutationEnvelopeShape,
  snapshotId: boundedString(64),
});
export type ArenaChallengeRequest = z.infer<typeof ArenaChallengeRequestSchema>;

export const ArenaSnapshotsQuerySchema = z.object({
  excludeMine: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

// Re-export the array/string bounds as schema helpers for endpoint owners
// that need to validate additional bounded fields later.
export const boundedStringSchema = boundedString;
export const boundedArraySchema = <T extends z.ZodTypeAny>(item: T, max = MAX_ARRAY_LENGTH) =>
  z.array(item).max(max);
