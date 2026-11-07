// Season (G8) and tournament (G9) pure helpers (design/studio/contracts.md
// sections 10-11; design/game/m3-systems.md sections 8-9). Pure: no clock,
// no storage, no client-supplied seeds — the server-side persistence,
// lazy `ensureSeasonAdvanced` transaction boundary and exactly-once
// resolution guards belong to M3-08. This module only computes schedules,
// scores, standings, bracket seats/advancement and byes from inputs the
// caller already has.

import { autoFillLoadoutV3, type ClassIdV3 } from "@banner-and-bounty/content";
import type { HeroBuildV3 } from "./builds3.js";

// ---------------------------------------------------------------------------
// Season epoch and timestamps (m3-systems.md section 8)
// ---------------------------------------------------------------------------

export function seasonIndexForV3(epochMs: number, nowMs: number, seasonLengthMs: number): number {
  return Math.floor((nowMs - epochMs) / seasonLengthMs);
}
export function seasonStartV3(epochMs: number, seasonIndex: number, seasonLengthMs: number): number {
  return epochMs + seasonLengthMs * seasonIndex;
}
export function seasonLockDeadlineV3(epochMs: number, seasonIndex: number, seasonLengthMs: number, entryWindowMs: number): number {
  return seasonStartV3(epochMs, seasonIndex, seasonLengthMs) + entryWindowMs;
}
export function seasonEndV3(epochMs: number, seasonIndex: number, seasonLengthMs: number): number {
  return seasonStartV3(epochMs, seasonIndex, seasonLengthMs) + seasonLengthMs;
}
export function isWithinEntryWindowV3(epochMs: number, seasonIndex: number, nowMs: number, seasonLengthMs: number, entryWindowMs: number): boolean {
  return nowMs < seasonLockDeadlineV3(epochMs, seasonIndex, seasonLengthMs, entryWindowMs);
}

// ---------------------------------------------------------------------------
// Fixtures (m3-systems.md section 8: four labelled server opponents)
// ---------------------------------------------------------------------------

export type FixtureIdV3 = "fixture_m3_01" | "fixture_m3_02" | "fixture_m3_03" | "fixture_m3_04";

const FIXTURE_COMPOSITIONS: Record<FixtureIdV3, readonly ClassIdV3[]> = {
  fixture_m3_01: ["class_vanguard", "class_cleric", "class_ranger", "class_rogue", "class_herald"],
  fixture_m3_02: ["class_warder", "class_vanguard", "class_weaver", "class_cleric", "class_arcanist"],
  fixture_m3_03: ["class_vanguard", "class_ranger", "class_herald", "class_cleric", "class_weaver"],
  fixture_m3_04: ["class_warder", "class_rogue", "class_ranger", "class_arcanist", "class_cleric"],
};

export const FIXTURE_IDS_V3: readonly FixtureIdV3[] = ["fixture_m3_01", "fixture_m3_02", "fixture_m3_03", "fixture_m3_04"];

/**
 * m3-systems.md section 8: five level-5, unequipped Vesperkin heroes,
 * null secondaries/specs, Active 1/2=primary I/II, Passive 1=primary I,
 * Passive 2 empty (autoFillLoadoutV3 at level 5 already yields exactly
 * that: both unlock<=5 actives, only the one unlock<=5 passive).
 */
export function buildFixtureCompanyV3(fixtureId: FixtureIdV3): readonly HeroBuildV3[] {
  return FIXTURE_COMPOSITIONS[fixtureId].map((primaryClassId, slotIndex) => ({
    primaryClassId,
    secondaryClassId: null,
    primarySpecializationId: null,
    raceId: "race_vesper" as const,
    level: 5,
    slotIndex,
    equipment: { weapon: null, armor: null, trinket: null },
    skillLoadout: autoFillLoadoutV3(primaryClassId, 5),
  }));
}

/** Fills up to 2 human seats with fixtures in ascending ID, to exactly 4 seats. */
export function fillSeasonSeatsV3(humanEntryIds: readonly string[]): readonly string[] {
  if (humanEntryIds.length > 2) throw new Error("At most two local human entries per season");
  const seats = [...humanEntryIds];
  for (const fixtureId of FIXTURE_IDS_V3) {
    if (seats.length >= 4) break;
    seats.push(fixtureId);
  }
  return seats;
}
export function isFixtureEntryV3(entryId: string): entryId is FixtureIdV3 {
  return (FIXTURE_IDS_V3 as readonly string[]).includes(entryId);
}

// ---------------------------------------------------------------------------
// Double round robin schedule (contracts.md section 10)
// ---------------------------------------------------------------------------

export interface SeasonMatchFixtureV3 {
  readonly pairKey: string; // `${lowId}|${highId}`, for seed lookup/storage
  readonly leg: 1 | 2;
  readonly teamAEntryId: string;
  readonly teamBEntryId: string;
  readonly seed: number;
}

/**
 * Exactly four seats, six unordered pairs, two legs each (team A/B swap
 * between legs) = 12 matches. Pairs ordered lexicographically by
 * `(lowId, highId)`; within a pair, leg 1 then leg 2. `seedFor` must be a
 * pure deterministic function of `(pairKey, leg)` — the server stores its
 * result before resolving; this module never calls `Math.random`.
 */
export function buildDoubleRoundRobinScheduleV3(seatEntryIds: readonly string[], seedFor: (pairKey: string, leg: 1 | 2) => number): readonly SeasonMatchFixtureV3[] {
  if (seatEntryIds.length !== 4 || new Set(seatEntryIds).size !== 4) throw new Error("Season schedule requires exactly four distinct seats");
  const sorted = [...seatEntryIds].sort();
  const pairs: Array<readonly [string, string]> = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) pairs.push([sorted[i]!, sorted[j]!]);
  }
  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  const matches: SeasonMatchFixtureV3[] = [];
  for (const [low, high] of pairs) {
    const pairKey = `${low}|${high}`;
    matches.push({ pairKey, leg: 1, teamAEntryId: low, teamBEntryId: high, seed: seedFor(pairKey, 1) });
    matches.push({ pairKey, leg: 2, teamAEntryId: high, teamBEntryId: low, seed: seedFor(pairKey, 2) });
  }
  return matches;
}

/** A pure, deterministic default seed derivation — not cryptographic, only reproducible. */
export function defaultSeasonSeedV3(seasonIndex: number, pairKey: string, leg: 1 | 2): number {
  let x = 0x9e3779b9 ^ seasonIndex;
  const s = `${pairKey}#${leg}`;
  for (let i = 0; i < s.length; i++) {
    x = Math.imul(x ^ s.charCodeAt(i), 0x45d9f3b) >>> 0;
  }
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0 || 1;
}

// ---------------------------------------------------------------------------
// Scoring and standings (m3-systems.md section 8)
// ---------------------------------------------------------------------------

export type MatchResultV3 = "a_win" | "b_win" | "draw";

export function matchPointsV3(result: MatchResultV3, side: "A" | "B"): number {
  if (result === "draw") return 1;
  if (result === "a_win") return side === "A" ? 3 : 0;
  return side === "B" ? 3 : 0;
}

export interface ResolvedSeasonMatchV3 {
  readonly teamAEntryId: string;
  readonly teamBEntryId: string;
  readonly result: MatchResultV3;
}

export interface SeasonStandingRowV3 {
  readonly entryId: string;
  readonly points: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly matchesPlayed: number;
}

/** Rank by points desc, then wins desc, then entryId asc (stable "ID tiebreak"). */
export function computeStandingsV3(entryIds: readonly string[], matches: readonly ResolvedSeasonMatchV3[]): readonly SeasonStandingRowV3[] {
  const rows = new Map<string, { points: number; wins: number; draws: number; losses: number; matchesPlayed: number }>();
  for (const id of entryIds) rows.set(id, { points: 0, wins: 0, draws: 0, losses: 0, matchesPlayed: 0 });

  for (const match of matches) {
    const a = rows.get(match.teamAEntryId);
    const b = rows.get(match.teamBEntryId);
    if (!a || !b) throw new Error("Season match references an unknown entry");
    a.matchesPlayed += 1;
    b.matchesPlayed += 1;
    a.points += matchPointsV3(match.result, "A");
    b.points += matchPointsV3(match.result, "B");
    if (match.result === "draw") {
      a.draws += 1;
      b.draws += 1;
    } else if (match.result === "a_win") {
      a.wins += 1;
      b.losses += 1;
    } else {
      b.wins += 1;
      a.losses += 1;
    }
  }

  return [...rows.entries()]
    .map(([entryId, r]) => ({ entryId, ...r }))
    .sort((x, y) => y.points - x.points || y.wins - x.wins || x.entryId.localeCompare(y.entryId));
}

// ---------------------------------------------------------------------------
// Tournament bracket (m3-systems.md section 9)
// ---------------------------------------------------------------------------

export interface TournamentSeatV3 {
  readonly seed: 1 | 2 | 3 | 4;
  readonly entryId: string | null; // null only in the recovery/vacant-seat path
}

export interface TournamentBracketSeatsV3 {
  readonly semifinal1: readonly [TournamentSeatV3, TournamentSeatV3]; // seeds 1 vs 4
  readonly semifinal2: readonly [TournamentSeatV3, TournamentSeatV3]; // seeds 2 vs 3
}

/** Seeds ascending by stable entryId, independent of season standings. */
export function createTournamentBracketSeatsV3(seatEntryIds: readonly string[]): TournamentBracketSeatsV3 {
  if (seatEntryIds.length !== 4 || new Set(seatEntryIds).size !== 4) throw new Error("Tournament bracket requires exactly four distinct seats");
  const sorted = [...seatEntryIds].sort();
  const seat = (seed: 1 | 2 | 3 | 4): TournamentSeatV3 => ({ seed, entryId: sorted[seed - 1]! });
  return { semifinal1: [seat(1), seat(4)], semifinal2: [seat(2), seat(3)] };
}

export type AdvancementReasonV3 = "decisive" | "hp_tiebreak" | "survivor_tiebreak" | "seed_tiebreak" | "bye";

export interface TiebreakInputSideV3 {
  readonly entryId: string;
  readonly seed: number;
  /** remainingHp/maxHp per original hero, in original-roster order; dead heroes already 0. */
  readonly heroHpRatios: readonly number[];
}

export interface AdvancementResultV3 {
  readonly winnerEntryId: string;
  readonly reason: AdvancementReasonV3;
  readonly compared: { readonly aHp: number; readonly bHp: number; readonly aSurvivors: number; readonly bSurvivors: number } | null;
}

function normalizedHpV3(ratios: readonly number[]): number {
  if (ratios.length === 0) return 0;
  const sum = ratios.reduce((total, ratio) => total + Math.floor(10000 * Math.max(0, ratio)), 0);
  return Math.floor(sum / ratios.length);
}

/**
 * contracts.md section 11: decisive combat result -> its winner. Otherwise
 * (draw/timeout) compare normalized HP, then survivor count, then lower
 * seed number — in that order, each only as a tiebreak for the previous.
 */
export function resolveAdvancementV3(combatResult: "a_win" | "b_win" | "draw", a: TiebreakInputSideV3, b: TiebreakInputSideV3): AdvancementResultV3 {
  if (combatResult !== "draw") {
    return { winnerEntryId: combatResult === "a_win" ? a.entryId : b.entryId, reason: "decisive", compared: null };
  }
  const aHp = normalizedHpV3(a.heroHpRatios);
  const bHp = normalizedHpV3(b.heroHpRatios);
  const aSurvivors = a.heroHpRatios.filter((r) => r > 0).length;
  const bSurvivors = b.heroHpRatios.filter((r) => r > 0).length;
  const compared = { aHp, bHp, aSurvivors, bSurvivors };
  if (aHp !== bHp) return { winnerEntryId: aHp > bHp ? a.entryId : b.entryId, reason: "hp_tiebreak", compared };
  if (aSurvivors !== bSurvivors) return { winnerEntryId: aSurvivors > bSurvivors ? a.entryId : b.entryId, reason: "survivor_tiebreak", compared };
  return { winnerEntryId: a.seed < b.seed ? a.entryId : b.entryId, reason: "seed_tiebreak", compared };
}

// ---------------------------------------------------------------------------
// Byes (m3-systems.md section 9: recovery-only, clearly labelled)
// ---------------------------------------------------------------------------

export interface BracketMatchSeatV3 {
  readonly entryId: string | null; // null = persisted vacancy (unusable/unresolved snapshot)
  readonly seed: number;
}

export type BracketMatchOutcomeV3 =
  | { readonly kind: "resolved"; readonly winnerEntryId: string; readonly reason: AdvancementReasonV3 }
  | { readonly kind: "bye"; readonly winnerEntryId: string }
  | { readonly kind: "no_winner" }; // both seats vacant

/**
 * One match's seat-vacancy resolution, independent of actually simulating
 * combat: if exactly one seat is vacant the other advances by bye with no
 * report/score; if both are vacant there is no winner for this slot
 * (propagates as a vacant seat to the next round); if neither is vacant the
 * caller must still simulate combat and call `resolveAdvancementV3`.
 */
export function resolveBracketSeatVacancyV3(seatA: BracketMatchSeatV3, seatB: BracketMatchSeatV3): BracketMatchOutcomeV3 | null {
  const aVacant = seatA.entryId === null;
  const bVacant = seatB.entryId === null;
  if (aVacant && bVacant) return { kind: "no_winner" };
  if (aVacant) return { kind: "bye", winnerEntryId: seatB.entryId! };
  if (bVacant) return { kind: "bye", winnerEntryId: seatA.entryId! };
  return null; // both seats usable; caller simulates and resolves normally
}

/** m3-systems.md section 9: a bye-only champion (no played match anywhere) earns no title. */
export function championEarnsTitleV3(semifinal1: BracketMatchOutcomeV3, semifinal2: BracketMatchOutcomeV3, final: BracketMatchOutcomeV3 | null): boolean {
  if (!final || final.kind !== "resolved") return false;
  return semifinal1.kind !== "no_winner" && semifinal2.kind !== "no_winner";
}
