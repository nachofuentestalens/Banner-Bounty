import { describe, expect, it } from "vitest";
import {
  FIXTURE_IDS_V3,
  buildDoubleRoundRobinScheduleV3,
  buildFixtureCompanyV3,
  championEarnsTitleV3,
  computeStandingsV3,
  createTournamentBracketSeatsV3,
  defaultSeasonSeedV3,
  fillSeasonSeatsV3,
  isFixtureEntryV3,
  isWithinEntryWindowV3,
  resolveAdvancementV3,
  resolveBracketSeatVacancyV3,
  seasonEndV3,
  seasonIndexForV3,
  seasonLockDeadlineV3,
  seasonStartV3,
} from "./competition3.js";

const EPOCH = 10_000_000;
const SEASON_LENGTH = 604_800_000;
const ENTRY_WINDOW = 86_400_000;

describe("season epoch arithmetic", () => {
  it("computes season index and boundaries from the epoch", () => {
    expect(seasonIndexForV3(EPOCH, EPOCH, SEASON_LENGTH)).toBe(0);
    expect(seasonIndexForV3(EPOCH, EPOCH + SEASON_LENGTH + 1, SEASON_LENGTH)).toBe(1);
    expect(seasonStartV3(EPOCH, 2, SEASON_LENGTH)).toBe(EPOCH + 2 * SEASON_LENGTH);
    expect(seasonLockDeadlineV3(EPOCH, 0, SEASON_LENGTH, ENTRY_WINDOW)).toBe(EPOCH + ENTRY_WINDOW);
    expect(seasonEndV3(EPOCH, 0, SEASON_LENGTH)).toBe(EPOCH + SEASON_LENGTH);
  });

  it("entry window closes exactly at 24h, never includes it", () => {
    expect(isWithinEntryWindowV3(EPOCH, 0, EPOCH + ENTRY_WINDOW - 1, SEASON_LENGTH, ENTRY_WINDOW)).toBe(true);
    expect(isWithinEntryWindowV3(EPOCH, 0, EPOCH + ENTRY_WINDOW, SEASON_LENGTH, ENTRY_WINDOW)).toBe(false);
  });
});

describe("fixtures", () => {
  it("builds exactly five level-5 unequipped Vesperkin heroes per fixture, Passive 2 always empty", () => {
    for (const id of FIXTURE_IDS_V3) {
      const company = buildFixtureCompanyV3(id);
      expect(company).toHaveLength(5);
      company.forEach((hero, slot) => {
        expect(hero.slotIndex).toBe(slot);
        expect(hero.level).toBe(5);
        expect(hero.raceId).toBe("race_vesper");
        expect(hero.secondaryClassId).toBeNull();
        expect(hero.primarySpecializationId).toBeNull();
        expect(hero.equipment).toEqual({ weapon: null, armor: null, trinket: null });
        expect(hero.skillLoadout.active[0]).not.toBe("");
        expect(hero.skillLoadout.passive[1]).toBe(""); // Passive II unlocks at 8
      });
    }
  });

  it("every fixture ID is recognized by isFixtureEntryV3 and no human entry collides", () => {
    for (const id of FIXTURE_IDS_V3) expect(isFixtureEntryV3(id)).toBe(true);
    expect(isFixtureEntryV3("account-123")).toBe(false);
  });
});

describe("fillSeasonSeatsV3", () => {
  it("fills unused seats with fixtures in ascending ID", () => {
    expect(fillSeasonSeatsV3([])).toEqual(["fixture_m3_01", "fixture_m3_02", "fixture_m3_03", "fixture_m3_04"]);
    expect(fillSeasonSeatsV3(["acct-a"])).toEqual(["acct-a", "fixture_m3_01", "fixture_m3_02", "fixture_m3_03"]);
    expect(fillSeasonSeatsV3(["acct-a", "acct-b"])).toEqual(["acct-a", "acct-b", "fixture_m3_01", "fixture_m3_02"]);
  });
  it("rejects more than two human entries", () => {
    expect(() => fillSeasonSeatsV3(["a", "b", "c"])).toThrow();
  });
});

describe("buildDoubleRoundRobinScheduleV3", () => {
  const seats = ["d", "b", "c", "a"];

  it("produces exactly 12 matches: six pairs, two legs each", () => {
    const seen: number[] = [];
    const matches = buildDoubleRoundRobinScheduleV3(seats, (pairKey, leg) => {
      seen.push(leg);
      return pairKey.length + leg;
    });
    expect(matches).toHaveLength(12);
    const pairKeys = new Set(matches.map((m) => m.pairKey));
    expect(pairKeys.size).toBe(6);
  });

  it("orders pairs lexicographically and swaps team A/B between legs", () => {
    const matches = buildDoubleRoundRobinScheduleV3(seats, () => 0);
    expect(matches[0]).toMatchObject({ pairKey: "a|b", leg: 1, teamAEntryId: "a", teamBEntryId: "b" });
    expect(matches[1]).toMatchObject({ pairKey: "a|b", leg: 2, teamAEntryId: "b", teamBEntryId: "a" });
    expect(matches[2]).toMatchObject({ pairKey: "a|c", leg: 1 });
    // Every entry plays exactly six matches (three opponents x two legs).
    const playCount = new Map<string, number>();
    for (const m of matches) {
      playCount.set(m.teamAEntryId, (playCount.get(m.teamAEntryId) ?? 0) + 1);
      playCount.set(m.teamBEntryId, (playCount.get(m.teamBEntryId) ?? 0) + 1);
    }
    for (const id of seats) expect(playCount.get(id)).toBe(6);
  });

  it("rejects anything other than exactly four distinct seats", () => {
    expect(() => buildDoubleRoundRobinScheduleV3(["a", "b", "c"], () => 1)).toThrow();
    expect(() => buildDoubleRoundRobinScheduleV3(["a", "a", "b", "c"], () => 1)).toThrow();
  });
});

describe("defaultSeasonSeedV3", () => {
  it("is a pure deterministic function: same inputs always produce the same seed", () => {
    const a = defaultSeasonSeedV3(3, "a|b", 1);
    const b = defaultSeasonSeedV3(3, "a|b", 1);
    expect(a).toBe(b);
  });
  it("differs across legs and pairs (not a constant)", () => {
    expect(defaultSeasonSeedV3(3, "a|b", 1)).not.toBe(defaultSeasonSeedV3(3, "a|b", 2));
    expect(defaultSeasonSeedV3(3, "a|b", 1)).not.toBe(defaultSeasonSeedV3(3, "a|c", 1));
  });
});

describe("computeStandingsV3", () => {
  it("ranks by points desc, then wins desc, then entryId asc", () => {
    const entries = ["a", "b", "c"];
    const matches = [
      { teamAEntryId: "a", teamBEntryId: "b", result: "a_win" as const },
      { teamAEntryId: "b", teamBEntryId: "c", result: "draw" as const },
      { teamAEntryId: "c", teamBEntryId: "a", result: "b_win" as const }, // a wins again
    ];
    const standings = computeStandingsV3(entries, matches);
    expect(standings.map((s) => s.entryId)).toEqual(["a", "b", "c"]);
    expect(standings[0]).toMatchObject({ entryId: "a", points: 6, wins: 2, losses: 0 });
    expect(standings[1]).toMatchObject({ entryId: "b", points: 1, wins: 0, draws: 1, losses: 1 });
    expect(standings[2]).toMatchObject({ entryId: "c", points: 1, wins: 0, draws: 1, losses: 1 });
  });

  it("includes a zero-row for an entry that played no matches", () => {
    const standings = computeStandingsV3(["lonely"], []);
    expect(standings).toEqual([{ entryId: "lonely", points: 0, wins: 0, draws: 0, losses: 0, matchesPlayed: 0 }]);
  });
});

describe("createTournamentBracketSeatsV3", () => {
  it("seeds ascending by entryId: 1v4 and 2v3", () => {
    const bracket = createTournamentBracketSeatsV3(["d", "b", "c", "a"]);
    expect(bracket.semifinal1.map((s) => s.entryId)).toEqual(["a", "d"]);
    expect(bracket.semifinal2.map((s) => s.entryId)).toEqual(["b", "c"]);
    expect(bracket.semifinal1.map((s) => s.seed)).toEqual([1, 4]);
  });
});

describe("resolveAdvancementV3", () => {
  const side = (entryId: string, seed: number, ratios: readonly number[]) => ({ entryId, seed, heroHpRatios: ratios });

  it("a decisive result advances its winner without comparing anything", () => {
    const result = resolveAdvancementV3("a_win", side("a", 1, [0.1]), side("b", 4, [0.9]));
    expect(result).toEqual({ winnerEntryId: "a", reason: "decisive", compared: null });
  });

  it("a draw falls back to normalized HP", () => {
    const a = side("a", 1, [0.8, 0]); // normalized (8000+0)/2=4000
    const b = side("b", 4, [0.3, 0.3]); // normalized (3000+3000)/2=3000
    const result = resolveAdvancementV3("draw", a, b);
    expect(result.reason).toBe("hp_tiebreak");
    expect(result.winnerEntryId).toBe("a");
    expect(result.compared).toEqual({ aHp: 4000, bHp: 3000, aSurvivors: 1, bSurvivors: 2 });
  });

  it("equal HP falls back to survivor count", () => {
    const a = side("a", 1, [0.5, 0.5]); // normalized 5000, 2 survivors
    const b = side("b", 4, [1, 0]); // normalized 5000, 1 survivor
    const result = resolveAdvancementV3("draw", a, b);
    expect(result.reason).toBe("survivor_tiebreak");
    expect(result.winnerEntryId).toBe("a");
  });

  it("equal HP and survivors falls back to lower seed", () => {
    const a = side("a", 3, [0.5]);
    const b = side("b", 1, [0.5]);
    const result = resolveAdvancementV3("draw", a, b);
    expect(result.reason).toBe("seed_tiebreak");
    expect(result.winnerEntryId).toBe("b"); // lower seed number
  });
});

describe("resolveBracketSeatVacancyV3 and championEarnsTitleV3", () => {
  it("one vacant seat yields a bye for the other", () => {
    expect(resolveBracketSeatVacancyV3({ entryId: null, seed: 1 }, { entryId: "b", seed: 4 })).toEqual({ kind: "bye", winnerEntryId: "b" });
  });
  it("two vacant seats yield no winner for that match", () => {
    expect(resolveBracketSeatVacancyV3({ entryId: null, seed: 1 }, { entryId: null, seed: 4 })).toEqual({ kind: "no_winner" });
  });
  it("two usable seats defer to real combat resolution", () => {
    expect(resolveBracketSeatVacancyV3({ entryId: "a", seed: 1 }, { entryId: "b", seed: 4 })).toBeNull();
  });

  it("a champion crowned via a real resolved final with two resolved semifinals earns the title", () => {
    const resolved = { kind: "resolved" as const, winnerEntryId: "a", reason: "decisive" as const };
    expect(championEarnsTitleV3(resolved, resolved, resolved)).toBe(true);
  });
  it("a bye-only champion (final never actually played) earns no title", () => {
    const resolved = { kind: "resolved" as const, winnerEntryId: "a", reason: "decisive" as const };
    const bye = { kind: "bye" as const, winnerEntryId: "a" };
    expect(championEarnsTitleV3(resolved, resolved, bye)).toBe(false);
  });
  it("a doubly-vacant semifinal propagates to no champion at all", () => {
    const resolved = { kind: "resolved" as const, winnerEntryId: "a", reason: "decisive" as const };
    const noWinner = { kind: "no_winner" as const };
    expect(championEarnsTitleV3(noWinner, resolved, resolved)).toBe(false);
  });
});
