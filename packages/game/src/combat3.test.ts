import { describe, it, expect } from "vitest";
import { CLASSES_V3, SPECIALIZATIONS_V3, autoFillLoadoutV3, getDungeonV3, type ClassIdV3 } from "@banner-and-bounty/content";
import { simulateBattleV3, type CombatantInputV3, type HeroCombatantInputV3 } from "./combat3.js";
import { computeBattleStartStatsV3 } from "./builds3.js";
import { buildEnemyCombatantsV3 } from "./encounters3.js";
import { simulateBattleV2 } from "./combat2.js";

function hero(primaryClassId: ClassIdV3, patch: Partial<HeroCombatantInputV3> = {}): CombatantInputV3 & { kind: "hero" } {
  return { kind: "hero", id: "hero", slotIndex: 0, primaryClassId, secondaryClassId: null, primarySpecializationId: null,
    raceId: "race_cairn", level: 10, equipment: { weapon: null, armor: null, trinket: null },
    skillLoadout: { active: ["", ""], passive: ["", ""] }, ...patch };
}
function enemy(id = "enemy", slotIndex = 0, hp = 1000, atk = 1, spd = 1, enemyId = "enemy_aqueduct_husk"): CombatantInputV3 & { kind: "enemy" } {
  return { kind: "enemy", id, slotIndex, enemyId, stats: { maxHp: hp, atk, def: 0, spd } };
}
function skillHero(classId: ClassIdV3, skill: string, spec: string | null = null, patch: Partial<HeroCombatantInputV3> = {}) {
  return hero(classId, { primarySpecializationId: spec ? `m3spec_${spec}` : null, skillLoadout: { active: [skill, ""], passive: ["", ""] }, ...patch });
}
const run = (a: CombatantInputV3[], b: CombatantInputV3[], seed = 37) => simulateBattleV3(a, b, "pve", seed);

describe("M3 combat kernel", () => {
  it("is deterministic through JSON round-trip, input order and repeated execution, in PvE and PvP", () => {
    const a = [hero("class_warder", { id: "warder", secondaryClassId: "class_cleric", primarySpecializationId: "m3spec_warder_mender", skillLoadout: { active: ["skill_warder_repair", "mending_light"], passive: ["skill_warder_aftercare", "devotion"] } }),
      hero("class_vanguard", { id: "vanguard", slotIndex: 1, secondaryClassId: "class_weaver", skillLoadout: { active: ["skill_weaver_snare", "shield_bash"], passive: ["thick_hide", "skill_weaver_tension"] } })];
    const b = [hero("class_weaver", { id: "weaver", skillLoadout: autoFillLoadoutV3("class_weaver", 10) })];
    const snapshot = structuredClone(a);
    for (const kind of ["pve", "arena"] as const) {
      const first = simulateBattleV3(a, b, kind, 12345);
      expect(simulateBattleV3(JSON.parse(JSON.stringify(a)), b, kind, 12345)).toEqual(first);
      const reordered = simulateBattleV3([...a].reverse(), b, kind, 12345);
      expect(reordered.events).toEqual(first.events);
      expect(reordered.finalHp).toEqual(first.finalHp);
    }
    expect(a).toEqual(snapshot);
  });
  it.each(["class_warder", "class_weaver"] as const)("runs %s full unlocked kit at 1/3/5/8/10 against PvE and PvP", classId => {
    for (const level of [1, 3, 5, 8, 10]) {
      const build = hero(classId, { level, skillLoadout: autoFillLoadoutV3(classId, level) });
      for (const kind of ["pve", "arena"] as const) {
        const opponent = kind === "arena" ? hero("class_cleric", { id: "other", level, skillLoadout: autoFillLoadoutV3("class_cleric", level) }) : enemy();
        const battle = simulateBattleV3([build], [opponent], kind, 91);
        expect(battle.rounds).toBeLessThanOrEqual(100);
        expect(battle.events.some(e => e.skillId === autoFillLoadoutV3(classId, level).active[0])).toBe(true);
        expect(Object.values(battle.finalHp).every(hp => hp >= 0)).toBe(true);
      }
    }
  });
  it.each(SPECIALIZATIONS_V3)("$specializationId has no effect without its named skill slotted", spec => {
    const build = hero(spec.classId);
    const plain = run([build], [enemy()], 100);
    expect(run([{ ...build, primarySpecializationId: spec.specializationId }], [enemy()], 100)).toEqual(plain);
  });
  it("Sentinel fortifies only the lowest-HP% other ally and handles a solo bearer", () => {
    const bearer = skillHero("class_vanguard", "bulwark_call", "vanguard_sentinel");
    const ally = hero("class_rogue", { id: "ally", slotIndex: 3 });
    const events = run([bearer, ally], [enemy()]).events.filter(e => e.round === 1 && e.skillId === "bulwark_call");
    expect(events.filter(e => e.statusApplied?.statusId === "status_fortify").map(e => e.targetId)).toEqual(["hero", "ally"]);
    expect(run([bearer], [enemy()]).events.filter(e => e.round === 1 && e.skillId === "bulwark_call")).toHaveLength(2);
  });
  it("Breaker bypasses rows while normal Shield Bash stays in front", () => {
    const a = skillHero("class_vanguard", "shield_bash");
    const b = [enemy("front", 0, 1000), enemy("back", 3, 100)];
    expect(run([a], b).events[0]!.targetId).toBe("front");
    expect(run([{ ...a, primarySpecializationId: "m3spec_vanguard_breaker" }], b).events[0]!.targetId).toBe("back");
  });
  it("Tracker executes in the 31..50% band; ordinary Aimed Shot does not", () => {
    const target = enemy("target", 0, 200);
    for (const spec of [null, "ranger_tracker"]) {
      const hits = run([skillHero("class_ranger", "aimed_shot", spec)], [target]).events.filter(e => e.skillId === "aimed_shot" && !e.dodged);
      const middle = hits.filter(e => e.damageBreakdown!.hpBefore > 60 && e.damageBreakdown!.hpBefore <= 100);
      expect(middle.length).toBeGreaterThan(0);
      expect(middle.every(e => e.damageBreakdown!.steps.some(s => s.kind === "execute") === (spec !== null))).toBe(true);
    }
  });
  it("Scatter chooses three row-legal targets once, resolving them in slot order", () => {
    const a = skillHero("class_ranger", "volley", "ranger_scatter");
    const b = [enemy("two", 2, 800), enemy("zero", 0, 1000), enemy("one", 1, 900), enemy("back", 3, 100)];
    expect(run([a], b).events.filter(e => e.round === 1 && e.skillId === "volley").map(e => e.targetId)).toEqual(["zero", "one", "two"]);
    expect(run([{ ...a, primarySpecializationId: null }], b).events.filter(e => e.round === 1 && e.skillId === "volley")).toHaveLength(2);
  });
  it("Ember selects the highest current HP within the legal row", () => {
    const a = skillHero("class_arcanist", "firebolt", "arcanist_ember");
    const b = [enemy("high", 0, 1000), enemy("low", 1, 400), enemy("back", 3, 2000)];
    expect(run([a], b).events[0]!.targetId).toBe("high");
    expect(run([{ ...a, primarySpecializationId: null }], b).events[0]!.targetId).toBe("low");
  });
  it("Quench removes Haste and Choir dodge before damage, including when the hit dodges", () => {
    const a = skillHero("class_arcanist", "meteor", "arcanist_quench");
    const b = skillHero("class_herald", "war_hymn", null, { id: "herald", secondaryClassId: "class_cleric", slotIndex: 3 });
    let dodges = 0;
    for (let seed = 1; seed <= 32; seed++) {
      const events = simulateBattleV3([a], [b], "arena", seed).events;
      const remove = events.findIndex(e => e.round === 1 && e.type === "status_remove" && e.statusExpired === "status_haste");
      const hit = events.findIndex(e => e.round === 1 && e.skillId === "meteor" && e.damageBreakdown);
      expect(remove).toBeGreaterThanOrEqual(0);
      expect(remove).toBeLessThan(hit);
      expect(events[hit]!.damageBreakdown!.steps.find(s => s.kind === "dodge_roll")!.inputs[1]).toBe(15);
      if (events[hit]!.dodged) dodges++;
    }
    expect(dodges).toBeGreaterThan(0);
  });
  it("Triage replaces the heal factor below 30%, then applies Devotion", () => {
    const a = skillHero("class_cleric", "mending_light", "cleric_triage", { skillLoadout: { active: ["mending_light", ""], passive: ["devotion", ""] } });
    const baseline = computeBattleStartStatsV3(a);
    let triggered = 0;
    for (let seed = 1; seed <= 32; seed++) {
      let hp = baseline.maxHp;
      for (const e of run([a], [enemy("hitter", 0, 1000, 30, 1)], seed).events) {
        if (e.targetId !== a.id) continue;
        if (e.skillId === "mending_light") {
          const percent = Math.floor(hp * 100 / baseline.maxHp);
          let heal = Math.floor(baseline.atk * (percent < 30 ? 6 : 4) / 5);
          if (percent < 50) heal = Math.floor(heal * 6 / 5);
          expect(e.amount).toBe(Math.min(heal, baseline.maxHp - hp));
          if (percent < 30) triggered++;
        }
        if (e.hpAfter !== null) hp = e.hpAfter;
      }
    }
    expect(triggered).toBeGreaterThan(0);
  });
  it("Shelter grants Regen and one-round Fortify to every living ally", () => {
    const a = skillHero("class_cleric", "sanctuary", "cleric_shelter");
    const events = run([a, hero("class_warder", { id: "ally", slotIndex: 4 })], [enemy()]).events.filter(e => e.round === 1 && e.skillId === "sanctuary");
    expect(events.map(e => [e.targetId, e.statusApplied?.statusId, e.statusApplied?.duration])).toEqual([
      ["hero", "status_regen", 3], ["hero", "status_fortify", 1], ["ally", "status_regen", 3], ["ally", "status_fortify", 1],
    ]);
  });
  it("Duelist and Dissonance use highest current ATK across rows", () => {
    const b = [enemy("high", 0, 1000, 8), enemy("back", 4, 1000, 1)];
    for (const [classId, skill, spec] of [["class_rogue", "backstab", "rogue_duelist"], ["class_herald", "discordant_verse", "herald_dissonance"]] as const) {
      const a = skillHero(classId, skill, spec);
      expect(run([a], b).events.find(e => e.sourceId === a.id)!.targetId).toBe("high");
      expect(run([a], [b[1]!, { ...b[0]!, slotIndex: 3 }]).events.find(e => e.sourceId === a.id)!.targetId).toBe("high");
    }
  });
  it("Pursuer reselects after a kill; a discarded second hit consumes no RNG", () => {
    const a = skillHero("class_rogue", "flurry", "rogue_pursuer");
    const b = [enemy("weak", 0, 1), enemy("next", 1, 500)];
    const hits = run([a], b, 37).events.filter(e => e.round === 1 && e.skillId === "flurry");
    expect(hits.map(e => e.targetId)).toEqual(["weak", "next"]);
    const solo = [enemy("weak", 0, 1)];
    expect(run([a], solo)).toEqual(run([{ ...a, primarySpecializationId: null }], solo));
  });
  it("Cadence removes Weaken before Haste and emits no removal when absent", () => {
    // Opposing Herald is faster via secondary, so Weaken precedes this Hymn.
    const a = skillHero("class_herald", "war_hymn", "herald_cadence");
    const b = skillHero("class_herald", "discordant_verse", null, { id: "other", secondaryClassId: "class_rogue" });
    const events = simulateBattleV3([a], [b], "arena", 17).events.filter(e => e.round === 1 && e.sourceId === a.id);
    expect(events[0]).toMatchObject({ type: "status_remove", statusExpired: "status_weaken" });
    expect(events[1]!.statusApplied?.statusId).toBe("status_haste");
    expect(run([a], [enemy()]).events.filter(e => e.type === "status_remove")).toHaveLength(0);
  });
  it("Anchor taunts the Brace recipient, replaces an earlier taunt and expires after one round", () => {
    const a = skillHero("class_warder", "skill_warder_brace", "warder_anchor");
    const ally = skillHero("class_vanguard", "bulwark_call", null, { id: "old_taunter", slotIndex: 1 });
    const events = run([a, ally], [enemy()]).events.filter(e => e.round === 1);
    expect(events.find(e => e.type === "status_remove" && e.targetId === ally.id)?.statusExpired).toBe("status_taunt");
    expect(events.find(e => e.skillId === "skill_warder_brace" && e.statusApplied?.statusId === "status_taunt")).toMatchObject({ targetId: a.id, statusApplied: { duration: 1 } });
    expect(events.find(e => e.type === "status_expire" && e.targetId === a.id)?.statusExpired).toBe("status_taunt");
  });
  it("Mender selects two HP%-ordered allies once, heals at 4/5 and applies Aftercare to each", () => {
    const a = skillHero("class_warder", "skill_warder_repair", "warder_mender", { slotIndex: 4, skillLoadout: { active: ["skill_warder_repair", ""], passive: ["skill_warder_aftercare", ""] } });
    const allies = [hero("class_vanguard", { id: "front0", slotIndex: 0 }), hero("class_vanguard", { id: "front1", slotIndex: 1 })];
    const events = run([a, ...allies], [enemy("spark", 0, 1000, 25, 20, "enemy_archive_spark")]).events;
    const casts = events.filter(e => e.round === 1 && e.skillId === "skill_warder_repair");
    expect(casts.map(e => e.targetId)).toEqual(["front0", a.id]);
    expect(casts.every(e => e.statusApplied?.statusId === "status_regen" && e.statusApplied.duration === 2)).toBe(true);
    expect(casts.find(e => e.targetId === a.id)!.amount).toBe(Math.floor(computeBattleStartStatsV3(a).atk * 4 / 5));
    const normal = run([{ ...a, primarySpecializationId: null }, ...allies], [enemy("spark", 0, 1000, 25, 20, "enemy_archive_spark")]).events.filter(e => e.round === 1 && e.skillId === "skill_warder_repair");
    expect(normal).toHaveLength(1);
  });
  it("Fray strips Haste only on landed Snare, which applies Weaken only on hit", () => {
    const a = skillHero("class_weaver", "skill_weaver_snare", "weaver_fray");
    const b = skillHero("class_herald", "war_hymn", null, { id: "hymn", slotIndex: 3 });
    let landed = 0, dodged = 0;
    for (let seed = 1; seed <= 32; seed++) {
      const events = simulateBattleV3([a], [b], "arena", seed).events.filter(e => e.round === 1 && e.skillId === "skill_weaver_snare");
      const hit = events.find(e => e.damageBreakdown)!;
      if (hit.dodged) { dodged++; expect(events).toHaveLength(1); expect(hit.statusApplied).toBeNull(); }
      else { landed++; expect(hit.statusApplied?.statusId).toBe("status_weaken"); expect(events[1]!.statusExpired).toBe("status_haste"); }
    }
    expect(landed).toBeGreaterThan(0); expect(dodged).toBeGreaterThan(0);
  });
  it("Unravel strips Fortify before dodge; Sever prioritizes a fortified enemy over higher ATK", () => {
    const a = skillHero("class_weaver", "skill_weaver_unravel", "weaver_sever");
    const b = [enemy("binder", 3, 1000, 1, 20, "enemy_archive_binder"), enemy("high", 0, 1000, 3)];
    let dodges = 0;
    for (let seed = 1; seed <= 32; seed++) {
      const events = run([a], b, seed).events.filter(e => e.round === 1 && e.skillId === "skill_weaver_unravel");
      expect(events[0]).toMatchObject({ type: "status_remove", targetId: "binder", statusExpired: "status_fortify" });
      expect(events[1]!.targetId).toBe("binder");
      if (events[1]!.dodged) dodges++;
      else expect(events[1]!.damageBreakdown!.steps.some(s => s.kind === "fortify")).toBe(false);
    }
    expect(dodges).toBeGreaterThan(0);
    expect(run([{ ...a, primarySpecializationId: null }], b).events.find(e => e.skillId === "skill_weaver_unravel")!.targetId).toBe("high");
  });
  it("Tension multiplies after the original kit and before crit; Snare does not benefit from its own new Weaken", () => {
    const a = skillHero("class_arcanist", "firebolt", null, { secondaryClassId: "class_weaver", skillLoadout: { active: ["firebolt", ""], passive: ["overload", "skill_weaver_tension"] } });
    const debuffer = skillHero("class_herald", "discordant_verse", null, { id: "debuffer", slotIndex: 1 });
    const events = run([a, debuffer], [enemy()], 123).events.filter(e => e.skillId === "firebolt" && !e.dodged);
    const critical = events.find(e => e.crit && e.damageBreakdown!.steps.some(s => s.kind === "tension"))!;
    expect(critical).toBeDefined();
    const kinds = critical.damageBreakdown!.steps.map(s => s.kind);
    expect(kinds.indexOf("tension")).toBeGreaterThan(kinds.indexOf("overload"));
    expect(kinds.indexOf("tension")).toBeLessThan(kinds.indexOf("critical"));
    const snare = skillHero("class_weaver", "skill_weaver_snare", null, { skillLoadout: { active: ["skill_weaver_snare", ""], passive: ["skill_weaver_tension", ""] } });
    expect(run([snare], [enemy()]).events.find(e => e.skillId === "skill_weaver_snare")!.damageBreakdown!.steps.some(s => s.kind === "tension")).toBe(false);
  });
  it("Slip adds ten dodge points and stacks with Evasion and back row", () => {
    const a = hero("class_weaver", { slotIndex: 3, secondaryClassId: "class_rogue", skillLoadout: { active: ["", ""], passive: ["evasion", "skill_weaver_slip"] } });
    const hit = run([a], [enemy()]).events.find(e => e.targetId === a.id && e.damageBreakdown)!;
    expect(hit.damageBreakdown!.steps.find(s => s.kind === "dodge_roll")!.inputs[1]).toBe(40);
  });
  it("Archive boss follows fortify/index/basic/sweep and keeps sparse enemy slots", () => {
    const floor = getDungeonV3("dungeon_cinder_archive").floors[3]!;
    const b = buildEnemyCombatantsV3(floor.enemies);
    expect(b.map(e => e.slotIndex)).toEqual([0, 3]);
    const a = [hero("class_vanguard", { id: "tank", skillLoadout: { active: ["bulwark_call", ""], passive: ["thick_hide", "last_stand"] } }),
      hero("class_cleric", { id: "healer", slotIndex: 3, skillLoadout: autoFillLoadoutV3("class_cleric", 10) })];
    const events = run(a, b).events.filter(e => e.sourceId === "boss_archive_custodian#0" && e.round <= 4);
    expect(events.map(e => [e.round, e.type])).toEqual([[1, "archive_fortify"], [2, "archive_index"], [3, "enemy_strike"], [4, "cinder_sweep"], [4, "cinder_sweep"]]);
    expect(events.filter(e => e.type === "cinder_sweep").every(e => e.statusApplied === null)).toBe(true);
  });
  it("rejects bad snapshots and never changes legacy combat output", () => {
    const a = hero("class_vanguard");
    expect(() => run([a, { ...a, slotIndex: 1 }], [enemy()])).toThrow(/distinct/);
    expect(() => run([a, { ...a, id: "other" }], [enemy()])).toThrow(/formation/);
    expect(() => run([{ ...a, primarySpecializationId: "m3spec_weaver_sever" }], [enemy()])).toThrow();
    expect(() => run([{ ...a, skillLoadout: { active: ["skill_weaver_snare", ""], passive: ["", ""] } }], [enemy()])).toThrow();
    const legacy = { ...a, primaryClassId: "class_vanguard" as const, secondaryClassId: null };
    const before = simulateBattleV2([legacy], [enemy()], "pve", 7);
    for (const c of CLASSES_V3) run([hero(c.classId)], [enemy()]);
    expect(simulateBattleV2([legacy], [enemy()], "pve", 7)).toEqual(before);
    expect(before.units[0]!.maxHp).toBe(85);
  });
});
