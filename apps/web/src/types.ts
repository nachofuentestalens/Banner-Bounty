// View-model shapes matching apps/server's actual JSON responses
// (design/studio/contracts.md + the M1-08/M1-11 additive fields). Kept local
// to apps/web rather than imported from @banner-and-bounty/contracts because
// the server composes ad hoc response shapes (e.g. buildAccountState) that
// are not yet promoted to named exported types in that package.

export type EquipmentSlot = "weapon" | "armor" | "trinket";

export interface Hero {
  heroId: string;
  accountId: string;
  classId: string;
  level: number;
  xp: number;
  specializationId: string | null;
  equipment: Record<EquipmentSlot, string | null>;
}

export interface ItemInstance {
  itemInstanceId: string;
  accountId: string;
  definitionId: string;
  affixId: string | null;
  equippedBy: string | null;
}

export interface ExpeditionNone {
  status: "none";
  checkpointAt: null;
  cyclesCompletedSinceStart: 0;
}

export interface ExpeditionActive {
  status: "active";
  startedAt: string;
  checkpointAt: string;
  frozenLoadout: unknown;
  rulesVersion: number;
  cyclesCompletedSinceStart: number;
  wins: number;
  losses: number;
}

export type ExpeditionView = ExpeditionNone | ExpeditionActive;

export interface BossClaim {
  accountId: string;
  bossId: string;
  claimedAt: string | null;
}

export interface AccountState {
  heroes: Hero[];
  inventory: ItemInstance[];
  partyOrder: { accountId: string; order: [string, string, string] } | null;
  expedition: ExpeditionView;
  gold: number;
  bossClaims: BossClaim[];
  revision: number;
}

export interface CycleLogEntry {
  cycle: number;
  result: "win" | "loss" | "draw";
  rounds: number;
  gold: number;
  drop: { definitionId: string; affixId: string | null } | null;
  converted: boolean;
}

export interface SettlementResult {
  creditedCycles: number;
  elapsedMs: number;
  discardedMs: number;
  rewards: { xp: number; gold: number; items: ItemInstance[] };
  checkpointAt: string;
  outcomes: { wins: number; losses: number };
  overflow: { convertedCount: number; convertedGold: number };
  recentCycles: CycleLogEntry[];
}

export interface BattleEvent {
  round: number;
  type: string;
  sourceId: string | null;
  targetId: string | null;
  amount: number;
  hpAfter: number | null;
}

export interface BattleResultSummary {
  outcome: "win" | "loss" | "draw";
  rounds: number;
  finalHp: Record<string, number>;
}

export interface BattleReportView {
  reportId: string;
  kind: "pve" | "boss" | "arena";
  participantsSnapshot: unknown;
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
  position: number;
  classId: string;
  level: number;
  specializationId: string | null;
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
