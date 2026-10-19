// Deterministic battle simulation (design/game/combat.md sections 2-7).

import type { ClassId, SpecializationId } from "@banner-and-bounty/content";
import type { EffectiveStats } from "./stats.js";

export type BattleKind = "pve" | "boss" | "arena";
export type BattleResultKind = "win" | "loss" | "draw";

export interface HeroCombatantInput {
  readonly id: string;
  readonly side: "hero";
  readonly position: number; // 0-2, party order
  readonly classId: ClassId;
  readonly specializationId: SpecializationId | null; // already level-gated (stats.ts effectiveSpecialization)
  readonly stats: EffectiveStats;
}

export interface EnemyCombatantInput {
  readonly id: string;
  readonly side: "enemy";
  readonly slot: number;
  readonly stats: { readonly maxHp: number; readonly atk: number; readonly def: number; readonly spd: number };
  readonly isBoss?: boolean;
}

export interface BattleEvent {
  readonly round: number;
  readonly type: string;
  readonly sourceId: string | null;
  readonly targetId: string | null;
  readonly amount: number; // negative for damage, positive for healing
  readonly hpAfter: number | null;
}

export interface BattleResult {
  readonly result: BattleResultKind;
  readonly rounds: number;
  readonly events: readonly BattleEvent[];
  readonly finalHp: Readonly<Record<string, number>>;
}

interface ActorState {
  readonly id: string;
  readonly side: "hero" | "enemy";
  readonly team: "A" | "B"; // PvE/boss: heroes are always "A", enemies "B" (unused by `side`-based filtering below); arena: the two hero teams
  readonly tieIndex: number; // hero: party position; enemy: encounter slot
  readonly stats: { maxHp: number; atk: number; def: number; spd: number };
  hp: number;
  readonly specializationId: SpecializationId | null;
  readonly isBoss: boolean;
  burn: { stacks: number; duration: number; tickAtk: number } | null;
  guardedBy: string | null;
}

function basicDamage(atk: number, targetDef: number): number {
  return Math.max(1, atk - Math.floor(targetDef / 2));
}

function pickLowestHp(candidates: readonly ActorState[]): ActorState | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.hp < best.hp || (c.hp === best.hp && c.tieIndex < best.tieIndex) ? c : best));
}

function hpPercent(actor: ActorState): number {
  return Math.floor((actor.hp * 100) / actor.stats.maxHp);
}

function pickLowestHpPercent(candidates: readonly ActorState[]): ActorState | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) =>
    hpPercent(c) < hpPercent(best) || (hpPercent(c) === hpPercent(best) && c.tieIndex < best.tieIndex) ? c : best,
  );
}

function pickLowestPosition(candidates: readonly ActorState[]): ActorState | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.tieIndex < best.tieIndex ? c : best));
}

function applyHpChange(
  actor: ActorState,
  delta: number,
  events: BattleEvent[],
  round: number,
  type: string,
  sourceId: string | null,
): void {
  const clamped = Math.max(0, Math.min(actor.stats.maxHp, actor.hp + delta));
  const actualDelta = clamped - actor.hp;
  actor.hp = clamped;
  events.push({ round, type, sourceId, targetId: actor.id, amount: actualDelta, hpAfter: actor.hp });
}

/** Routes enemy/boss damage to a guarded hero's Guardian per combat.md 3.4. */
function dealDamageToHero(
  actors: readonly ActorState[],
  target: ActorState,
  rawDamage: number,
  events: BattleEvent[],
  round: number,
  type: string,
  sourceId: string,
): void {
  if (target.guardedBy) {
    const guardian = actors.find((a) => a.id === target.guardedBy);
    if (guardian && guardian.hp > 0) {
      const toGuardian = Math.floor(rawDamage / 2);
      const toTarget = rawDamage - toGuardian;
      applyHpChange(guardian, -toGuardian, events, round, `${type}_guard_redirect`, sourceId);
      applyHpChange(target, -toTarget, events, round, type, sourceId);
      return;
    }
  }
  applyHpChange(target, -rawDamage, events, round, type, sourceId);
}

function resolveHeroAction(actor: ActorState, actors: readonly ActorState[], events: BattleEvent[], round: number): void {
  const livingEnemies = actors.filter((a) => a.side === "enemy" && a.hp > 0);
  const livingHeroes = actors.filter((a) => a.side === "hero" && a.hp > 0);

  switch (actor.specializationId) {
    case "spec_guardian": {
      const guardTarget = pickLowestHpPercent(livingHeroes);
      if (guardTarget) guardTarget.guardedBy = actor.id;
      const target = pickLowestHp(livingEnemies);
      if (target) applyHpChange(target, -basicDamage(actor.stats.atk, target.stats.def), events, round, "guard_strike", actor.id);
      return;
    }
    case "spec_berserker": {
      const target = pickLowestHp(livingEnemies);
      if (!target) return;
      let dmg = basicDamage(actor.stats.atk, target.stats.def);
      if (actor.hp < Math.floor(actor.stats.maxHp / 2)) dmg = Math.floor((dmg * 5) / 4);
      applyHpChange(target, -dmg, events, round, "reckless_strike", actor.id);
      return;
    }
    case "spec_marksman": {
      const executeCandidates = livingEnemies.filter((e) => hpPercent(e) <= 30);
      const bonus = executeCandidates.length > 0;
      const target = bonus ? pickLowestHp(executeCandidates) : pickLowestHp(livingEnemies);
      if (!target) return;
      let dmg = basicDamage(actor.stats.atk, target.stats.def);
      if (bonus) dmg = Math.floor((dmg * 3) / 2);
      applyHpChange(target, -dmg, events, round, "aimed_shot", actor.id);
      return;
    }
    case "spec_pyromancer": {
      const target = pickLowestHp(livingEnemies);
      if (!target) return;
      applyHpChange(target, -basicDamage(actor.stats.atk, target.stats.def), events, round, "firebolt", actor.id);
      if (target.hp <= 0) return;
      if (!target.burn) {
        target.burn = { stacks: 1, duration: 3, tickAtk: actor.stats.atk };
      } else if (target.burn.stacks === 1) {
        target.burn = { stacks: 2, duration: 3, tickAtk: actor.stats.atk };
      } // stacks === 2 (cap): direct damage already applied above, application ignored, duration not reset
      return;
    }
    case "spec_warden": {
      const target = pickLowestHpPercent(livingHeroes);
      if (!target) return;
      const heal = Math.floor((actor.stats.atk * 4) / 5);
      applyHpChange(target, heal, events, round, "mend", actor.id);
      return;
    }
    case "spec_pathfinder":
    default: {
      const target = pickLowestHp(livingEnemies);
      if (target) applyHpChange(target, -basicDamage(actor.stats.atk, target.stats.def), events, round, "strike", actor.id);
    }
  }
}

function resolveEnemyAction(actor: ActorState, actors: readonly ActorState[], events: BattleEvent[], round: number): void {
  const livingHeroes = actors.filter((a) => a.side === "hero" && a.hp > 0);
  if (livingHeroes.length === 0) return;

  if (actor.isBoss && round % 3 === 0) {
    const target = pickLowestHpPercent(livingHeroes)!;
    const dmg = Math.floor((basicDamage(actor.stats.atk, target.stats.def) * 3) / 2);
    dealDamageToHero(actors, target, dmg, events, round, "toll_smash", actor.id);
    return;
  }

  const target = pickLowestPosition(livingHeroes)!;
  const dmg = basicDamage(actor.stats.atk, target.stats.def);
  dealDamageToHero(actors, target, dmg, events, round, actor.isBoss ? "toll_strike" : "enemy_strike", actor.id);
}

function speedOrderCompare(a: ActorState, b: ActorState): number {
  if (a.stats.spd !== b.stats.spd) return b.stats.spd - a.stats.spd;
  if (a.side !== b.side) return a.side === "hero" ? -1 : 1;
  return a.tieIndex - b.tieIndex;
}

/**
 * Simulates a full battle per combat.md sections 2-7. Pure: takes only
 * participant definitions and the battle kind; no clock, RNG, or storage
 * access (rngSeed is accepted by none of this module's formulas, per
 * combat.md section 7 — combat outcomes never consume randomness).
 */
export function simulateBattle(
  heroes: readonly HeroCombatantInput[],
  enemies: readonly EnemyCombatantInput[],
  kind: BattleKind,
): BattleResult {
  const actors: ActorState[] = [
    ...heroes.map((h) => ({
      id: h.id,
      side: "hero" as const,
      team: "A" as const,
      tieIndex: h.position,
      stats: { ...h.stats },
      hp: h.stats.maxHp,
      specializationId: h.specializationId,
      isBoss: false,
      burn: null,
      guardedBy: null,
    })),
    ...enemies.map((e) => ({
      id: e.id,
      side: "enemy" as const,
      team: "B" as const,
      tieIndex: e.slot,
      stats: { ...e.stats },
      hp: e.stats.maxHp,
      specializationId: null,
      isBoss: e.isBoss ?? false,
      burn: null,
      guardedBy: null,
    })),
  ];

  const events: BattleEvent[] = [];
  let round = 1;
  let result: BattleResultKind | null = null;

  while (round <= 100) {
    const livingAtRoundStart = actors.filter((a) => a.hp > 0);
    const order = [...livingAtRoundStart].sort(speedOrderCompare);
    for (const a of actors) a.guardedBy = null;

    // Step 2: actions, in speed order; a defeated actor cannot act later this round.
    for (const actor of order) {
      if (actor.hp <= 0) continue;
      if (actor.side === "hero") resolveHeroAction(actor, actors, events, round);
      else resolveEnemyAction(actor, actors, events, round);
    }

    // Step 3: end-of-round status ticks, same order, living-at-this-point only.
    for (const actor of order) {
      if (actor.hp <= 0) continue;
      if (actor.burn && actor.burn.stacks > 0) {
        const dmg = actor.burn.stacks * Math.floor(actor.burn.tickAtk / 4);
        applyHpChange(actor, -dmg, events, round, "burn_tick", null);
      }
    }

    // Step 4: status duration decrement.
    for (const actor of actors) {
      if (actor.burn) {
        actor.burn.duration -= 1;
        if (actor.burn.duration <= 0) actor.burn = null;
      }
    }

    // Step 5: resolution check.
    const heroesAlive = actors.some((a) => a.side === "hero" && a.hp > 0);
    const enemiesAlive = actors.some((a) => a.side === "enemy" && a.hp > 0);
    if (!heroesAlive && !enemiesAlive) {
      result = kind === "arena" ? "draw" : "loss";
      break;
    }
    if (!enemiesAlive) {
      result = "win";
      break;
    }
    if (!heroesAlive) {
      result = "loss";
      break;
    }
    if (round === 100) {
      result = kind === "arena" ? "draw" : "loss";
      break;
    }
    round += 1;
  }

  const finalHp: Record<string, number> = {};
  for (const a of actors) finalHp[a.id] = a.hp;

  return { result: result!, rounds: round, events, finalHp };
}

/**
 * Generic damage application: redirects half the raw damage to a living
 * Guardian when the target is guarded (combat.md 3.4), regardless of which
 * side dealt the damage. Used by resolveEnemyAction (PvE/boss, unchanged
 * behavior from dealDamageToHero's original inline logic) and by the arena
 * action resolver below, where either team's heroes may hold guard duty.
 */
function dealDamage(
  actors: readonly ActorState[],
  target: ActorState,
  rawDamage: number,
  events: BattleEvent[],
  round: number,
  type: string,
  sourceId: string,
): void {
  dealDamageToHero(actors, target, rawDamage, events, round, type, sourceId);
}

/**
 * Arena-mode action resolver (design/game/combat.md's hero action rules,
 * section 3, applied symmetrically to both sides): an arena battle pits two
 * hero teams against each other, so every actor uses its own class
 * default/specialization action against the *opposing* team, never the
 * PvE/boss "lowest party position" enemy-AI targeting from
 * resolveEnemyAction (that rule is specific to non-hero content enemies,
 * combat.md 3.1, and does not apply here). This is a necessary extension of
 * combat.md, not an explicit rule in it: combat.md does not separately spell
 * out hero-vs-hero combat, since it was written around PvE/boss encounters;
 * reusing the identical class/spec formulas for both arena sides is the
 * natural reading of "the server simulates the current challenger's team
 * against that snapshot" (architecture.md) with no new numbers invented.
 */
function resolveArenaAction(actor: ActorState, actors: readonly ActorState[], events: BattleEvent[], round: number): void {
  const foes = actors.filter((a) => a.team !== actor.team && a.hp > 0);
  const allies = actors.filter((a) => a.team === actor.team && a.hp > 0);

  switch (actor.specializationId) {
    case "spec_guardian": {
      const guardTarget = pickLowestHpPercent(allies);
      if (guardTarget) guardTarget.guardedBy = actor.id;
      const target = pickLowestHp(foes);
      if (target) dealDamage(actors, target, basicDamage(actor.stats.atk, target.stats.def), events, round, "guard_strike", actor.id);
      return;
    }
    case "spec_berserker": {
      const target = pickLowestHp(foes);
      if (!target) return;
      let dmg = basicDamage(actor.stats.atk, target.stats.def);
      if (actor.hp < Math.floor(actor.stats.maxHp / 2)) dmg = Math.floor((dmg * 5) / 4);
      dealDamage(actors, target, dmg, events, round, "reckless_strike", actor.id);
      return;
    }
    case "spec_marksman": {
      const executeCandidates = foes.filter((e) => hpPercent(e) <= 30);
      const bonus = executeCandidates.length > 0;
      const target = bonus ? pickLowestHp(executeCandidates) : pickLowestHp(foes);
      if (!target) return;
      let dmg = basicDamage(actor.stats.atk, target.stats.def);
      if (bonus) dmg = Math.floor((dmg * 3) / 2);
      dealDamage(actors, target, dmg, events, round, "aimed_shot", actor.id);
      return;
    }
    case "spec_pyromancer": {
      const target = pickLowestHp(foes);
      if (!target) return;
      dealDamage(actors, target, basicDamage(actor.stats.atk, target.stats.def), events, round, "firebolt", actor.id);
      if (target.hp <= 0) return;
      if (!target.burn) {
        target.burn = { stacks: 1, duration: 3, tickAtk: actor.stats.atk };
      } else if (target.burn.stacks === 1) {
        target.burn = { stacks: 2, duration: 3, tickAtk: actor.stats.atk };
      }
      return;
    }
    case "spec_warden": {
      const target = pickLowestHpPercent(allies);
      if (!target) return;
      const heal = Math.floor((actor.stats.atk * 4) / 5);
      applyHpChange(target, heal, events, round, "mend", actor.id);
      return;
    }
    case "spec_pathfinder":
    default: {
      const target = pickLowestHp(foes);
      if (target) dealDamage(actors, target, basicDamage(actor.stats.atk, target.stats.def), events, round, "strike", actor.id);
    }
  }
}

function arenaSpeedOrderCompare(a: ActorState, b: ActorState): number {
  if (a.stats.spd !== b.stats.spd) return b.stats.spd - a.stats.spd;
  // Both actors are hero-ai in arena mode, so the "heroes before enemies"
  // PvE tie-break (combat.md 2.1) does not apply; team A (the challenger)
  // before team B (the snapshot opponent) is this engine's own deterministic
  // extension, then ascending party position as in the PvE rule.
  if (a.team !== b.team) return a.team === "A" ? -1 : 1;
  return a.tieIndex - b.tieIndex;
}

/**
 * Simulates an arena battle: the challenger's live team (`teamA`) against an
 * immutable published snapshot's team (`teamB`), both using full hero
 * class/specialization behavior (see resolveArenaAction above). Result is
 * reported from `teamA`'s (the challenger's) perspective. Pure and
 * deterministic like simulateBattle: no clock, RNG, or storage access.
 */
export function simulateArenaBattle(
  teamA: readonly HeroCombatantInput[],
  teamB: readonly HeroCombatantInput[],
): BattleResult {
  const actors: ActorState[] = [
    ...teamA.map((h) => ({
      id: h.id,
      side: "hero" as const,
      team: "A" as const,
      tieIndex: h.position,
      stats: { ...h.stats },
      hp: h.stats.maxHp,
      specializationId: h.specializationId,
      isBoss: false,
      burn: null,
      guardedBy: null,
    })),
    ...teamB.map((h) => ({
      id: h.id,
      side: "hero" as const,
      team: "B" as const,
      tieIndex: h.position,
      stats: { ...h.stats },
      hp: h.stats.maxHp,
      specializationId: h.specializationId,
      isBoss: false,
      burn: null,
      guardedBy: null,
    })),
  ];

  const events: BattleEvent[] = [];
  let round = 1;
  let result: BattleResultKind | null = null;

  while (round <= 100) {
    const livingAtRoundStart = actors.filter((a) => a.hp > 0);
    const order = [...livingAtRoundStart].sort(arenaSpeedOrderCompare);
    for (const a of actors) a.guardedBy = null;

    for (const actor of order) {
      if (actor.hp <= 0) continue;
      resolveArenaAction(actor, actors, events, round);
    }

    for (const actor of order) {
      if (actor.hp <= 0) continue;
      if (actor.burn && actor.burn.stacks > 0) {
        const dmg = actor.burn.stacks * Math.floor(actor.burn.tickAtk / 4);
        applyHpChange(actor, -dmg, events, round, "burn_tick", null);
      }
    }

    for (const actor of actors) {
      if (actor.burn) {
        actor.burn.duration -= 1;
        if (actor.burn.duration <= 0) actor.burn = null;
      }
    }

    const aAlive = actors.some((a) => a.team === "A" && a.hp > 0);
    const bAlive = actors.some((a) => a.team === "B" && a.hp > 0);
    if (!aAlive && !bAlive) {
      result = "draw";
      break;
    }
    if (!bAlive) {
      result = "win";
      break;
    }
    if (!aAlive) {
      result = "loss";
      break;
    }
    if (round === 100) {
      result = "draw";
      break;
    }
    round += 1;
  }

  const finalHp: Record<string, number> = {};
  for (const a of actors) finalHp[a.id] = a.hp;

  return { result: result!, rounds: round, events, finalHp };
}
