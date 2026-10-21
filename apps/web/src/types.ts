// View-model shapes matching apps/server's actual JSON responses
// (design/studio/contracts.md + the M1-08/M1-11/M2-25 additive fields). Kept
// local to apps/web rather than imported from @banner-and-bounty/contracts
// because the server composes ad hoc response shapes (e.g. buildAccountState)
// that are not yet promoted to named exported types in that package.

export type EquipmentSlot = "weapon" | "armor" | "trinket";

export interface SkillLoadout {
  active: [string, string];
  passive: [string, string];
}

export interface Hero {
  heroId: string;
  accountId: string;
  primaryClassId: string;
  secondaryClassId: string | null;
  level: number;
  xp: number;
  skillLoadout: SkillLoadout;
  equipment: Record<EquipmentSlot, string | null>;
  effectiveStats?: { maxHp: number; atk: number; def: number; spd: number };
}

export type RarityId = "common" | "uncommon" | "rare" | "epic";

export interface AffixInstance {
  affixId: string;
  value: number;
}

export interface ItemInstance {
  itemInstanceId: string;
  accountId: string;
  definitionId: string;
  rarityId: RarityId;
  affixes: AffixInstance[];
  equippedBy: string | null;
}

export type PartyFormation = { accountId: string; slots: [string | null, string | null, string | null, string | null, string | null] };

export interface ExpeditionNone {
  status: "none";
  areaId: null;
  checkpointAt: null;
  cyclesCompletedSinceStart: 0;
}

export interface ExpeditionActive {
  status: "active";
  areaId: string | null;
  startedAt: string;
  checkpointAt: string;
  frozenLoadout: unknown;
  rulesVersion: number;
  cyclesCompletedSinceStart: number;
  wins: number;
  losses: number;
}

export type ExpeditionView = ExpeditionNone | ExpeditionActive;

export interface DungeonRunView {
  status: "none" | "active";
  dungeonId: string | null;
  startedAt: string | null;
  checkpointAt: string | null;
  currentFloor: number;
  floorsCleared: number;
  rulesVersion: number | null;
  outcome: "none" | "cleared" | "failed";
}

export interface AreaSummary {
  areaId: string;
  unlocked: boolean;
  isSelected: boolean;
}

export interface BossClaim {
  accountId: string;
  bossId: string;
  claimedAt: string | null;
}

export interface MaterialBalance {
  scrap: number;
  sigil: number;
  core: number;
}

export interface AccountState {
  heroes: Hero[];
  inventory: ItemInstance[];
  formation: PartyFormation | null;
  areas: AreaSummary[];
  selectedAreaId: string;
  expedition: ExpeditionView;
  dungeon: DungeonRunView;
  gold: number;
  materials: MaterialBalance;
  bossClaims: BossClaim[];
  revision: number;
}

export interface CycleLogEntry {
  cycle: number;
  result: "win" | "loss" | "draw";
  rounds: number;
  gold: number;
  drop: { definitionId: string; rarityId: RarityId } | null;
  converted: boolean;
}

export interface SettlementResult {
  latestBattleReport?: BattleReportView;
  creditedCycles: number;
  elapsedMs: number;
  discardedMs: number;
  rewards: { xp: number; gold: number; items: ItemInstance[] };
  checkpointAt: string;
  outcomes: { wins: number; losses: number };
  overflow: { convertedCount: number; convertedGold: number };
  recentCycles: CycleLogEntry[];
}

// M2-25: the frozen battle-replay event schema (contracts.md). Every unit on
// both sides, with HP/class/statuses, and a per-action event carrying
// actor/skill/target/amount/crit/dodge/death — enough for the full battle
// view to render without a separate "current state" endpoint.
export interface BattleUnit {
  unitId: string;
  side: "A" | "B";
  kind: "hero" | "enemy";
  name: string;
  classId: string | null;
  secondaryClassId: string | null;
  slotIndex: number;
  maxHp: number;
}

export interface StatusApplied {
  statusId: string;
  duration: number;
  stacks?: number;
}

export interface BattleEvent {
  round: number;
  type: string;
  sourceId: string | null;
  targetId: string | null;
  amount: number;
  hpAfter: number | null;
  skillId: string | null;
  crit: boolean;
  dodged: boolean;
  statusApplied: StatusApplied | null;
  statusExpired: string | null;
  death: boolean;
}

export interface BattleParticipantsSnapshot {
  units: BattleUnit[];
}

export interface BattleResultSummary {
  outcome: "win" | "loss" | "draw";
  rounds: number;
  finalHp: Record<string, number>;
}

export type BattleReportKind = "pve" | "boss" | "arena" | "dungeon_floor" | "dungeon_boss";

export interface BattleReportView {
  reportId: string;
  kind: BattleReportKind;
  /** Pre-M2-25 saves may still carry the legacy loose shape; the battle view falls back to a plain log for those. */
  participantsSnapshot: BattleParticipantsSnapshot | unknown;
  seed: string;
  rulesVersion: number;
  events: BattleEvent[];
  result: BattleResultSummary;
  createdAt: string;
}

export interface BossChallengeResult {
  report: BattleReportView;
  rewardGranted: boolean;
  reward: { xp: number; gold: number; items: ItemInstance[]; overflowConvertedGold: number } | null;
}

export interface SnapshotSummary {
  snapshotId: string;
  accountId: string;
  publishedAt: string;
  rulesVersion: number;
  heroClasses: string[];
}

export interface SnapshotPartyEntry {
  heroId: string;
  slotIndex: number;
  primaryClassId: string;
  secondaryClassId: string | null;
  level: number;
  skillLoadout: SkillLoadout;
}

export interface SnapshotStatsEntry {
  heroId: string;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface SnapshotDetail {
  snapshotId: string;
  accountId: string;
  publishedAt: string;
  rulesVersion: number;
  frozenParty: SnapshotPartyEntry[];
  frozenStats: SnapshotStatsEntry[];
}

export interface ArenaChallengeResult {
  report: BattleReportView;
}

export interface DungeonFloorResult {
  floor: number;
  reportId: string;
  result: "win" | "loss";
  isBoss: boolean;
  rewards: { xp: number; gold: number; materials: MaterialBalance; items: ItemInstance[] };
}

export interface DungeonSettleResult {
  floorResults: DungeonFloorResult[];
  outcome: "in_progress" | "cleared" | "failed";
  elapsedMs: number;
  discardedMs: number;
  creditedFloors: number;
  checkpointAt: string;
  overflow: { convertedCount: number; convertedGold: number };
}
