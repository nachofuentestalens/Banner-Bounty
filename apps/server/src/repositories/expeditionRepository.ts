import type { DatabaseSync } from "node:sqlite";
import type { AffixInstance, ExpeditionStatus, RarityId } from "@banner-and-bounty/contracts";
import type { PartyMemberInputV2 } from "@banner-and-bounty/game";

type EquippedPresentation = { definitionId: string; rarityId: RarityId; affixes: AffixInstance[] } | null;

/** A frozen party member also remembers which instances fed its stats, for display (FrozenPartyMemberDTO). */
export interface FrozenPartyMember extends PartyMemberInputV2 {
  readonly equippedInstanceIds: { weapon: string | null; armor: string | null; trinket: string | null };
  readonly presentation: { weapon: EquippedPresentation; armor: EquippedPresentation; trinket: EquippedPresentation };
}

export interface ExpeditionRow {
  accountId: string;
  status: ExpeditionStatus;
  areaId: string | null;
  startedAt: string | null;
  checkpointAt: string | null;
  subCycleRemainderMs: number;
  frozenLoadout: FrozenPartyMember[] | null;
  rulesVersion: number | null;
  seed: number | null;
  rngState: number | null;
  cyclesCompleted: number;
  wins: number;
  losses: number;
  // M3-05 addition (section 2's Expedition changes): populated only for
  // rulesVersion === EXPEDITION_RULES_VERSION rows.
  msPerRound: number | null;
  pendingBattleReportId: string | null;
  nextOrdinal: number;
  runId: string | null;
}

interface ExpeditionTableRow extends Omit<ExpeditionRow, "frozenLoadout" | "status"> {
  status: string;
  frozenLoadout: string | null;
}

export class ExpeditionRepository {
  constructor(private readonly db: DatabaseSync) {}

  find(accountId: string): ExpeditionRow | null {
    const row = this.db
      .prepare("SELECT * FROM expeditions WHERE accountId = ?")
      .get(accountId) as ExpeditionTableRow | undefined;
    if (!row) return null;
    return {
      ...row,
      status: row.status as ExpeditionStatus,
      frozenLoadout: row.frozenLoadout ? (JSON.parse(row.frozenLoadout) as FrozenPartyMember[]) : null,
    };
  }

  isActive(accountId: string): boolean {
    return this.find(accountId)?.status === "active";
  }

  /** Replaces any previous (stopped) expedition row for the account. */
  start(
    row: Omit<ExpeditionRow, "status" | "cyclesCompleted" | "wins" | "losses" | "subCycleRemainderMs" | "nextOrdinal"> & {
      nextOrdinal?: number;
    },
  ): void {
    this.db
      .prepare(
        `INSERT INTO expeditions
          (accountId, status, areaId, startedAt, checkpointAt, subCycleRemainderMs, frozenLoadout, rulesVersion, seed, rngState, cyclesCompleted, wins, losses, msPerRound, pendingBattleReportId, nextOrdinal, runId)
         VALUES (?, 'active', ?, ?, ?, 0, ?, ?, ?, ?, 0, 0, 0, ?, NULL, ?, ?)
         ON CONFLICT(accountId) DO UPDATE SET
           status = 'active', areaId = excluded.areaId, startedAt = excluded.startedAt, checkpointAt = excluded.checkpointAt,
           subCycleRemainderMs = 0, frozenLoadout = excluded.frozenLoadout, rulesVersion = excluded.rulesVersion,
           seed = excluded.seed, rngState = excluded.rngState, cyclesCompleted = 0, wins = 0, losses = 0,
           msPerRound = excluded.msPerRound, pendingBattleReportId = NULL, nextOrdinal = excluded.nextOrdinal, runId = excluded.runId`,
      )
      .run(
        row.accountId,
        row.areaId,
        row.startedAt,
        row.checkpointAt,
        JSON.stringify(row.frozenLoadout),
        row.rulesVersion,
        row.seed,
        row.rngState,
        row.msPerRound,
        row.nextOrdinal ?? 1,
        row.runId,
      );
  }

  applySettlement(
    accountId: string,
    update: { checkpointAt: string; rngState: number; cycles: number; wins: number; losses: number },
  ): void {
    this.db
      .prepare(
        `UPDATE expeditions
           SET checkpointAt = ?, rngState = ?, cyclesCompleted = cyclesCompleted + ?, wins = wins + ?, losses = losses + ?
         WHERE accountId = ? AND status = 'active'`,
      )
      .run(update.checkpointAt, update.rngState, update.cycles, update.wins, update.losses, accountId);
  }

  /** M3-05 addition: persists settlement3's SettlementStateV3 plus battle counters. */
  applySettlementV3(
    accountId: string,
    update: {
      checkpointAt: string;
      rngState: number;
      pendingBattleReportId: string | null;
      nextOrdinal: number;
      battlesCredited: number;
      wins: number;
      losses: number;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE expeditions
           SET checkpointAt = ?, rngState = ?, pendingBattleReportId = ?, nextOrdinal = ?,
               cyclesCompleted = cyclesCompleted + ?, wins = wins + ?, losses = losses + ?
         WHERE accountId = ? AND status = 'active'`,
      )
      .run(
        update.checkpointAt,
        update.rngState,
        update.pendingBattleReportId,
        update.nextOrdinal,
        update.battlesCredited,
        update.wins,
        update.losses,
        accountId,
      );
  }

  stop(accountId: string): void {
    this.db.prepare("UPDATE expeditions SET status = 'none' WHERE accountId = ?").run(accountId);
  }
}
