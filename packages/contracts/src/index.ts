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
  "active_dungeon",
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

// M2-25 addition: skillLoadout replaces specializationId; primaryClassId
// renames classId; secondaryClassId is new (null until assigned at level 3+).
export interface SkillLoadout {
  active: readonly [string, string];
  passive: readonly [string, string];
}

export interface Hero {
  heroId: HeroId;
  accountId: AccountId;
  primaryClassId: string;
  secondaryClassId: string | null;
  level: number;
  xp: number;
  skillLoadout: SkillLoadout;
  equipment: HeroEquipment;
}

export type RarityId = "common" | "uncommon" | "rare" | "epic";

export interface AffixInstance {
  affixId: string;
  value: number;
}

// M2-25 addition: affixId replaced by rarityId/affixes (gear.md section 2).
export interface ItemInstance {
  itemInstanceId: ItemInstanceId;
  accountId: AccountId;
  definitionId: string;
  rarityId: RarityId;
  affixes: AffixInstance[];
  equippedBy: HeroId | null;
}

// M2-25 addition: replaces the fixed PartyOrder 3-tuple with 5 formation
// slots (index 0-2 front row, 3-4 back row); nulls are empty slots.
export interface PartyFormation {
  accountId: AccountId;
  slots: [HeroId | null, HeroId | null, HeroId | null, HeroId | null, HeroId | null];
}

// M2-25 addition: account-scoped nonnegative material counters (gear.md
// section 4), returned via /account/state like gold.
export interface MaterialBalance {
  accountId: AccountId;
  scrap: number;
  sigil: number;
  core: number;
}

export type DungeonOutcome = "none" | "cleared" | "failed";

// M2-25 addition: a single terminating dungeon run per account (not a
// repeating cycle like Expedition).
export interface DungeonRun {
  accountId: AccountId;
  status: ExpeditionStatus;
  dungeonId: string | null;
  startedAt: string | null;
  checkpointAt: string | null;
  currentFloor: number;
  floorsCleared: number;
  frozenLoadout: unknown | null;
  rulesVersion: number | null;
  rngState: string | null;
  outcome: DungeonOutcome;
}

/** DungeonRun as returned by start/settle/stop; rngState/seed stay server-private. */
export interface DungeonRunViewDTO {
  status: ExpeditionStatus;
  dungeonId: string | null;
  startedAt: string | null;
  checkpointAt: string | null;
  currentFloor: number;
  floorsCleared: number;
  rulesVersion: number | null;
  outcome: DungeonOutcome;
}

// M2-01 addition: server-owned reference data for expedition area choice.
export interface Area {
  areaId: string;
  unlockRequirement: { kind: string; value?: unknown };
}

export interface AreaSummaryDTO {
  areaId: string;
  unlocked: boolean;
  isSelected: boolean;
}

export type ExpeditionStatus = "none" | "active";

export interface Expedition {
  accountId: AccountId;
  status: ExpeditionStatus;
  areaId: string | null; // M2-01 addition: frozen at start from Account.selectedAreaId
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

// M2-25 addition: two new kinds for dungeon floors.
export type BattleReportKind = "pve" | "boss" | "arena" | "dungeon_floor" | "dungeon_boss";

// M2-25 addition: the exact TypeScript shape combat.md section 8.6 left to
// this document. Covers every unit on both sides (name/class/HP/statuses)
// and a per-action event (actor/skill/target/amount/crit/dodge/death) so the
// battle view can render every M2.md acceptance-check-4/5 field.
export interface BattleUnitDTO {
  unitId: string;
  side: "A" | "B";
  kind: "hero" | "enemy";
  name: string;
  classId: string | null;
  secondaryClassId: string | null;
  slotIndex: number;
  maxHp: number;
}

export interface StatusAppliedDTO {
  statusId: string;
  duration: number;
  stacks?: number;
}

/** Server-recorded arithmetic, in evaluation order. Optional on older reports. */
export interface DamageStep {
  readonly kind: string;
  readonly inputs: readonly number[];
  readonly value: number;
}
export interface DamageBreakdown {
  readonly steps: readonly DamageStep[];
  readonly damage: number;
  readonly hpBefore: number;
  readonly hpLoss: number;
}

export interface BattleEventDTO {
  readonly damageBreakdown?: DamageBreakdown;
  round: number;
  type: string;
  sourceId: string | null;
  targetId: string | null;
  amount: number;
  hpAfter: number | null;
  skillId: string | null;
  crit: boolean;
  dodged: boolean;
  statusApplied: StatusAppliedDTO | null;
  statusExpired: string | null;
  death: boolean;
}

export interface BattleParticipantsSnapshotDTO {
  units: BattleUnitDTO[];
}

export interface BattleResultDTO {
  outcome: "win" | "loss" | "draw";
  rounds: number;
  finalHp: Record<string, number>;
}

export interface BattleReport {
  reportId: ReportId;
  kind: BattleReportKind;
  /** Pre-M2-25 rows may still carry the legacy loose `unknown` shape (migration step 9). */
  participantsSnapshot: BattleParticipantsSnapshotDTO | unknown;
  seed: string;
  rulesVersion: number;
  events: BattleEventDTO[] | unknown[];
  result: BattleResultDTO | unknown;
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
// M1-08 response DTOs (expedition, settlement, boss). Fields marked
// "additive" extend the contracts.md shapes without changing existing ones.
// ---------------------------------------------------------------------------

/** M2-25: a frozen party member now carries dual-class/skillLoadout instead of a single specializationId. */
export interface FrozenPartyMemberDTO {
  heroId: HeroId;
  slotIndex: number;
  primaryClassId: string;
  secondaryClassId: string | null;
  level: number;
  skillLoadout: SkillLoadout;
  equipment: Record<EquipmentSlot, { definitionId: string; rarityId: RarityId; affixes: AffixInstance[] } | null>;
  equippedInstanceIds: HeroEquipment;
}

/** Expedition entity as returned by start/stop; rngState and seed stay server-private. */
export interface ExpeditionViewDTO {
  status: ExpeditionStatus;
  areaId: string | null; // additive, M2-01
  startedAt: string | null;
  checkpointAt: string | null;
  subCycleRemainderMs: number;
  frozenLoadout: FrozenPartyMemberDTO[] | null;
  rulesVersion: number | null;
  cyclesCompleted: number;
  wins: number; // additive
  losses: number; // additive
}

export interface CycleLogEntryDTO {
  cycle: number;
  result: "win" | "loss" | "draw";
  rounds: number;
  gold: number;
  drop: { definitionId: string; rarityId: RarityId } | null;
  converted: boolean;
}

export interface SettlementResultDTO {
  latestBattleReport?: BattleReport; // additive: last credited cycle only
  creditedCycles: number;
  elapsedMs: number;
  discardedMs: number;
  rewards: { xp: number; gold: number; items: ItemInstance[] };
  checkpointAt: string;
  outcomes: { wins: number; losses: number }; // additive
  overflow: { convertedCount: number; convertedGold: number }; // additive
  recentCycles: CycleLogEntryDTO[]; // additive, at most 10 entries
}

export interface BossChallengeResultDTO {
  report: BattleReport & { kind: "boss" };
  rewardGranted: boolean;
  /** Additive: what the one-time grant contained, or null when nothing was granted. */
  reward: { xp: number; gold: number; items: ItemInstance[]; overflowConvertedGold: number } | null;
}

// ---------------------------------------------------------------------------
// M2-25 response DTOs (recruit, formation, loadout, craft, reforge, dungeon)
// ---------------------------------------------------------------------------

export interface HeroResultDTO {
  hero: Hero;
}

export interface MaterialBalanceDTO {
  scrap: number;
  sigil: number;
  core: number;
}

export interface CraftResultDTO {
  item: ItemInstance;
  replacementConsumed: ItemInstanceId | null;
}

export interface ReforgeResultDTO {
  item: ItemInstance;
}

export interface DungeonFloorResultDTO {
  floor: number;
  reportId: ReportId;
  result: "win" | "loss";
  isBoss: boolean;
  rewards: { xp: number; gold: number; materials: MaterialBalanceDTO; items: ItemInstance[] };
}

export interface DungeonSettleResultDTO {
  floorResults: DungeonFloorResultDTO[];
  outcome: "in_progress" | "cleared" | "failed";
  elapsedMs: number;
  discardedMs: number;
  creditedFloors: number;
  checkpointAt: string;
  overflow: { convertedCount: number; convertedGold: number };
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

// M2-25: PartyFormation (5 slots, nulls allowed) replaces the fixed PartyOrder 3-tuple.
const nullableHeroId = z.union([boundedString(64), z.null()]);
export const PartyFormationRequestSchema = z.object({
  ...MutationEnvelopeShape,
  slots: z.tuple([nullableHeroId, nullableHeroId, nullableHeroId, nullableHeroId, nullableHeroId]).refine(
    (slots) => {
      const filled = slots.filter((s): s is string => s !== null);
      return filled.length >= 1 && filled.length <= 5 && new Set(filled).size === filled.length;
    },
    { message: "slots must contain 1-5 distinct hero IDs, with the rest null" },
  ),
});
export type PartyFormationRequest = z.infer<typeof PartyFormationRequestSchema>;

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

// M2-25: /hero/specialization is retired (Hero.specializationId no longer
// exists); dual-class assignment and skill loadout are now two separate
// endpoints, matching contracts.md's explicit "independently settable" rule.
export const HeroRecruitRequestSchema = z.object({
  ...MutationEnvelopeShape,
  primaryClassId: boundedString(64),
});
export type HeroRecruitRequest = z.infer<typeof HeroRecruitRequestSchema>;

export const SecondaryClassRequestSchema = z.object({
  ...MutationEnvelopeShape,
  heroId: boundedString(64),
  secondaryClassId: boundedString(64),
});
export type SecondaryClassRequest = z.infer<typeof SecondaryClassRequestSchema>;

const skillSlotSchema = z.union([boundedString(64), z.literal("")]);
export const LoadoutRequestSchema = z.object({
  ...MutationEnvelopeShape,
  heroId: boundedString(64),
  active: z.tuple([skillSlotSchema, skillSlotSchema]),
  passive: z.tuple([skillSlotSchema, skillSlotSchema]),
});
export type LoadoutRequest = z.infer<typeof LoadoutRequestSchema>;

export const CraftRequestSchema = z.object({
  ...MutationEnvelopeShape,
  recipeId: boundedString(64),
  definitionId: boundedString(64),
  replacementItemInstanceId: boundedString(64).optional(),
});
export type CraftRequest = z.infer<typeof CraftRequestSchema>;

export const ReforgeRequestSchema = z.object({
  ...MutationEnvelopeShape,
  itemInstanceId: boundedString(64),
  affixIndex: z.number().int().min(0).max(8),
});
export type ReforgeRequest = z.infer<typeof ReforgeRequestSchema>;

export const DungeonStartRequestSchema = z.object({
  ...MutationEnvelopeShape,
  dungeonId: boundedString(64),
});
export type DungeonStartRequest = z.infer<typeof DungeonStartRequestSchema>;

// M2-01: area selection (never implemented in apps/server until M2-27).
export const AreaSelectRequestSchema = z.object({
  ...MutationEnvelopeShape,
  areaId: boundedString(64),
});
export type AreaSelectRequest = z.infer<typeof AreaSelectRequestSchema>;

export const NoPayloadMutationRequestSchema = z.object({
  ...MutationEnvelopeShape,
});
export type NoPayloadMutationRequest = z.infer<typeof NoPayloadMutationRequestSchema>;

// Local debug tools (gated by apps/server's debugToolsEnabled; disabled by
// default so these never reach normal play). Same mutation envelope,
// precondition/revision/idempotency path as every other command — no
// direct DB write bypasses authoritative validation.
export const DebugSetHeroLevelRequestSchema = z.object({
  ...MutationEnvelopeShape,
  heroId: boundedString(64),
  level: z.number().int().min(1).max(10),
});
export type DebugSetHeroLevelRequest = z.infer<typeof DebugSetHeroLevelRequestSchema>;

export const DebugGrantHeroXpRequestSchema = z.object({
  ...MutationEnvelopeShape,
  heroId: boundedString(64),
  xp: z.number().int().min(1).max(100000),
});
export type DebugGrantHeroXpRequest = z.infer<typeof DebugGrantHeroXpRequestSchema>;

export const DebugGrantGoldRequestSchema = z.object({
  ...MutationEnvelopeShape,
  gold: z.number().int().min(1).max(1000000),
});
export type DebugGrantGoldRequest = z.infer<typeof DebugGrantGoldRequestSchema>;

export interface DebugGoldResultDTO {
  gold: number;
}

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
