import { expect, it } from "vitest";
import { simulateBattleV2, type CombatantInputV2 } from "./combat2.js";

const kits = [
  ["vanguard", "bulwark_call", "shield_bash", "thick_hide", "last_stand"],
  ["cleric", "mending_light", "sanctuary", "devotion", "vital_surge"],
  ["ranger", "aimed_shot", "volley", "hunters_focus", "momentum"],
  ["rogue", "backstab", "flurry", "opportunist", "evasion"],
  ["arcanist", "firebolt", "meteor", "overload", "arcane_reserve"],
  ["herald", "war_hymn", "discordant_verse", "encore", "battle_hymn"],
] as const;

function team(prefix: string, offset: number): CombatantInputV2[] {
  return Array.from({ length: 5 }, (_, slotIndex) => {
    const kit = kits[(slotIndex + offset) % kits.length]!;
    return { kind: "hero", id: `${prefix}${slotIndex}`, slotIndex, primaryClassId: `class_${kit[0]}`,
      secondaryClassId: null, level: 8, equipment: { weapon: null, armor: null, trinket: null },
      skillLoadout: { active: offset % 2 ? [kit[2], kit[1]] : [kit[1], kit[2]], passive: [kit[3], kit[4]] } };
  });
}

it("records complete arithmetic and HP reconciliation for mixed teams, AoE, multi-hit, ticks and survival", () => {
  const kinds = new Set<string>();
  for (let seed = 1; seed <= 36; seed++) {
    const result = simulateBattleV2(team("a", seed), team("b", seed + 1), "arena", seed);
    const hp = Object.fromEntries(result.units.map((unit) => [unit.unitId, unit.maxHp]));
    for (const event of result.events) {
      const d = event.damageBreakdown;
      if (event.amount < 0 || event.dodged) expect(d).toBeDefined();
      if (d) {
        expect(d.hpBefore).toBe(hp[event.targetId!]);
        expect(d.hpLoss).toBe(-event.amount || 0);
        expect(d.hpBefore - d.hpLoss).toBe(event.hpAfter);
        expect(d.damage).toBeGreaterThanOrEqual(d.hpLoss);
        for (const step of d.steps) {
          kinds.add(step.kind);
          const [a, b, c] = step.inputs as [number, number, number];
          if (step.kind === "base_damage") expect(step.value).toBe(Math.max(1, a - Math.floor(b / 2)));
          else if (step.kind.endsWith("_roll")) expect(step.value).toBe(a < b ? 1 : 0);
          else if (step.kind === "burn") expect(step.value).toBe(a * Math.floor(b / 3));
          else if (step.inputs.length === 3) expect(step.value).toBe(Math.floor(a * b / c));
        }
        if (event.dodged) {
          expect(d.damage).toBe(0);
          expect(d.steps.map((s) => s.kind)).toEqual(["dodge_roll"]);
        } else {
          const last = d.steps.filter((s) => s.kind !== "vital_surge").at(-1)!;
          expect(last.value).toBe(d.damage);
        }
      }
      if (event.hpAfter !== null) hp[event.targetId!] = event.hpAfter;
    }
    expect(hp).toEqual(result.finalHp);
    expect(simulateBattleV2(team("a", seed), team("b", seed + 1), "arena", seed)).toEqual(result);
  }
  for (const kind of ["base_damage", "weaken", "fortify", "critical", "guaranteed_crit", "burn", "vital_surge", "last_stand", "overload", "arcane_reserve", "volley", "meteor", "opportunist", "execute"]) expect(kinds.has(kind), kind).toBe(true);
});

it("distinguishes rolled damage from overkill without consuming rolls for Backstab", () => {
  const rogue = team("a", 3)[0]!;
  if (rogue.kind === "hero") Object.assign(rogue, { skillLoadout: { active: ["backstab", ""], passive: ["", ""] } });
  const result = simulateBattleV2([rogue], [{ kind: "enemy", id: "enemy", enemyId: "enemy_road_wolf", slotIndex: 0, stats: { maxHp: 1, atk: 1, def: 0, spd: 1 } }], "pve", 1);
  const hit = result.events.find((e) => e.damageBreakdown)!;
  expect(hit.damageBreakdown!.hpLoss).toBe(1);
  expect(hit.damageBreakdown!.damage).toBeGreaterThan(1);
  expect(hit.hpAfter).toBe(0);
  expect(hit.death).toBe(true);
  expect(hit.damageBreakdown!.steps.map((s) => s.kind)).toEqual(["guaranteed_crit", "attack", "defense", "base_damage", "critical"]);
});
