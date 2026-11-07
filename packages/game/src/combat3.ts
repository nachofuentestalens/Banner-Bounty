// M3 executor forked from combat2 at the M3-07 baseline. Keep combat2 intact:
// persisted legacy runs must never acquire M3 race/spec/skill behavior.
import {
  type ClassIdV3 as ClassId,
  basicAttackSkillIdV3 as basicAttackSkillId,
  getSkillV3 as getSkillDefinition,
  hasSynergy as classHasSynergy,
} from "@banner-and-bounty/content";
import { createRngState, drawUint32, type RngState } from "./rng.js";
import { type EffectiveStatsV2, applyPercentModifier } from "./stats2.js";
import { computeBattleStartStatsV3, type HeroBuildV3 } from "./builds3.js";
import type {
  BattleKindV2, BattleResultKindV2, StatusIdV2, StatusAppliedDTO,
  DamageStep, BattleEventV2, BattleResultV2, BattleUnitSummaryV2, EnemyCombatantInputV2,
} from "./combat2.js";

export interface HeroCombatantInputV3 extends HeroBuildV3 { readonly id: string }
export type CombatantInputV3 =
  | ({ readonly kind: "hero" } & HeroCombatantInputV3)
  | ({ readonly kind: "enemy" } & EnemyCombatantInputV2);

interface StatusInstance {
  statusId: StatusIdV2;
  duration: number;
  stacks: number; // meaningful only for status_burn
  tickAtk: number; // meaningful only for status_burn
  choirDodgeBonus: boolean; // meaningful only for status_haste
}

interface ActorState {
  readonly id: string;
  readonly team: "A" | "B";
  readonly kind: "hero" | "enemy";
  readonly slotIndex: number;
  readonly enemyId: string | null;
  readonly isBoss: boolean;
  readonly primaryClassId: ClassId | null;
  readonly secondaryClassId: ClassId | null;
  readonly primarySpecializationId: string | null;
  readonly activeSkills: readonly [string, string];
  readonly passiveSkills: readonly [string, string];
  readonly baseline: EffectiveStatsV2;
  readonly maxHp: number;
  hp: number;
  currentSpd: number;
  statuses: StatusInstance[];
  cooldowns: Map<string, number>;
  vitalSurgeUsed: boolean;
}

interface BattleCtx {
  damageSteps?: DamageStep[];
  readonly actors: ActorState[];
  readonly events: BattleEventV2[];
  round: number;
  rngState: RngState;
}

// --------------------------------------------------------------- utilities

function opposingTeam(team: "A" | "B"): "A" | "B" {
  return team === "A" ? "B" : "A";
}

function hpPercent(actor: ActorState): number {
  return Math.floor((actor.hp * 100) / actor.maxHp);
}

function hasPassive(actor: ActorState, skillId: string): boolean {
  return actor.kind === "hero" && actor.passiveSkills.includes(skillId);
}

function hasSynergy(actor: ActorState, name: string): boolean {
  return actor.kind === "hero" && classHasSynergy(actor.primaryClassId!, actor.secondaryClassId, name);
}

function hasSpec(actor: ActorState, id: string): boolean {
  return actor.kind === "hero" && actor.primarySpecializationId === `m3spec_${id}`;
}

function pickHighestHp(candidates: readonly ActorState[]): ActorState {
  return [...candidates].sort((a, b) => b.hp - a.hp || a.slotIndex - b.slotIndex)[0]!;
}
function pickHighestAtk(ctx: BattleCtx, candidates: readonly ActorState[]): ActorState {
  return [...candidates].sort((a, b) => readAtk(ctx, b) - readAtk(ctx, a) || a.slotIndex - b.slotIndex)[0]!;
}

function livingOnTeam(actors: readonly ActorState[], team: "A" | "B"): ActorState[] {
  return actors.filter((a) => a.team === team && a.hp > 0);
}

function frontRow(list: readonly ActorState[]): ActorState[] {
  return list.filter((a) => a.slotIndex <= 2);
}

function backRow(list: readonly ActorState[]): ActorState[] {
  return list.filter((a) => a.slotIndex >= 3);
}

function rowRespectingPool(list: readonly ActorState[]): ActorState[] {
  const front = frontRow(list);
  return front.length > 0 ? front : backRow(list);
}

function findTaunter(actors: readonly ActorState[], team: "A" | "B"): ActorState | null {
  return livingOnTeam(actors, team).find((a) => a.statuses.some((s) => s.statusId === "status_taunt")) ?? null;
}

/** combat.md 8.2: single-target offensive pool, taunt-overridden, then row-respecting unless `ignoresRowProtection`. */
function resolveSingleTargetPool(ctx: BattleCtx, actor: ActorState, ignoresRowProtection: boolean): ActorState[] {
  const opposing = opposingTeam(actor.team);
  const taunter = findTaunter(ctx.actors, opposing);
  if (taunter) return [taunter];
  const living = livingOnTeam(ctx.actors, opposing);
  return ignoresRowProtection ? living : rowRespectingPool(living);
}

/** AoE pool: never taunt-gated (combat.md 8.2). */
function resolveAoEPool(ctx: BattleCtx, actor: ActorState, ignoresRowProtection: boolean): ActorState[] {
  const opposing = opposingTeam(actor.team);
  const living = livingOnTeam(ctx.actors, opposing);
  return ignoresRowProtection ? living : rowRespectingPool(living);
}

function pickLowestHp(candidates: readonly ActorState[]): ActorState {
  return candidates.reduce((best, c) => (c.hp < best.hp || (c.hp === best.hp && c.slotIndex < best.slotIndex) ? c : best));
}

function pickLowestHpPercent(candidates: readonly ActorState[]): ActorState {
  return candidates.reduce((best, c) =>
    hpPercent(c) < hpPercent(best) || (hpPercent(c) === hpPercent(best) && c.slotIndex < best.slotIndex) ? c : best,
  );
}

function pickLowestPosition(candidates: readonly ActorState[]): ActorState {
  return candidates.reduce((best, c) => (c.slotIndex < best.slotIndex ? c : best));
}

function pickHighestSlotIndex(candidates: readonly ActorState[]): ActorState {
  return candidates.reduce((best, c) => (c.slotIndex > best.slotIndex ? c : best));
}

function bySlotIndex(a: ActorState, b: ActorState): number {
  return a.slotIndex - b.slotIndex;
}

function record(ctx: BattleCtx, kind: string, inputs: number[], value: number): number {
  ctx.damageSteps?.push({ kind, inputs, value });
  return value;
}
function scale(ctx: BattleCtx, kind: string, value: number, numerator: number, denominator: number): number {
  return record(ctx, kind, [value, numerator, denominator], Math.floor(value * numerator / denominator));
}
function basic(ctx: BattleCtx, atk: number, targetDef: number): number {
  return record(ctx, "base_damage", [atk, targetDef], Math.max(1, atk - Math.floor(targetDef / 2)));
}

/** classes.md 2.1 steps 6-7 for ATK: Arcane Reserve (dynamic passive, +10% while any opposing unit burns), then status_weaken (-30%). */
function readAtk(ctx: BattleCtx, actor: ActorState): number {
  let v = record(ctx, "attack", [], actor.baseline.atk);
  if (hasPassive(actor, "arcane_reserve")) {
    const opposing = opposingTeam(actor.team);
    const anyBurning = livingOnTeam(ctx.actors, opposing).some((a) => a.statuses.some((s) => s.statusId === "status_burn"));
    if (anyBurning) v = record(ctx, "arcane_reserve", [v, 110, 100], applyPercentModifier(v, 10));
  }
  if (actor.statuses.some((s) => s.statusId === "status_weaken")) v = record(ctx, "weaken", [v, 70, 100], applyPercentModifier(v, -30));
  return v;
}

/** classes.md 2.1 step 7 for DEF: status_fortify (+30%). No dynamic DEF passive exists in this kit. */
function readDef(ctx: BattleCtx, actor: ActorState): number {
  let v = record(ctx, "defense", [], actor.baseline.def);
  if (actor.statuses.some((s) => s.statusId === "status_fortify")) v = record(ctx, "fortify", [v, 130, 100], applyPercentModifier(v, 30));
  return v;
}

// ----------------------------------------------------------- RNG / hit roll

function rollPercent(ctx: BattleCtx): number {
  const draw = drawUint32(ctx.rngState);
  ctx.rngState = draw.nextState;
  return draw.value % 100;
}

function dodgeChanceFor(target: ActorState): number {
  let chance = 5;
  if (target.slotIndex >= 3) chance += 10;
  if (hasPassive(target, "evasion")) chance += 15;
  if (hasPassive(target, "skill_weaver_slip")) chance += 10;
  if (target.statuses.some((s) => s.statusId === "status_haste" && s.choirDodgeBonus)) chance += 5;
  return Math.max(0, Math.min(50, chance));
}

function critChanceFor(source: ActorState): number {
  let chance = 10;
  if (hasPassive(source, "hunters_focus")) chance += 15;
  return Math.max(0, Math.min(75, chance));
}

interface HitResult {
  readonly steps: DamageStep[];
  readonly amount: number;
  readonly crit: boolean;
  readonly dodged: boolean;
}

/**
 * combat.md 8.3: dodge roll, then (if not dodged) crit roll, then damage
 * (crit x3/2 applied after every other multiplier already baked into
 * `computeBaseDamage`), then Last Stand's -20% (classes.md 5.1, read-time).
 */
function resolveHit(ctx: BattleCtx, target: ActorState, computeBaseDamage: () => number, opts: { guaranteedCrit: boolean; critSource: ActorState }): HitResult {
  const steps: DamageStep[] = [];
  ctx.damageSteps = steps;
  try {
    if (!opts.guaranteedCrit) {
      const roll = rollPercent(ctx);
      const chance = dodgeChanceFor(target);
      record(ctx, "dodge_roll", [roll, chance], roll < chance ? 1 : 0);
      if (roll < chance) return { amount: 0, crit: false, dodged: true, steps };
    } else record(ctx, "guaranteed_crit", [], 1);
    let crit = opts.guaranteedCrit;
    if (!crit) {
      const roll = rollPercent(ctx);
      const chance = critChanceFor(opts.critSource);
      crit = roll < chance;
      record(ctx, "crit_roll", [roll, chance], crit ? 1 : 0);
    }
    let dmg = computeBaseDamage();
    if (hasPassive(opts.critSource, "skill_weaver_tension") && target.statuses.some(s => s.statusId === "status_weaken")) {
      dmg = scale(ctx, "tension", dmg, 11, 10);
    }
    if (crit) dmg = scale(ctx, "critical", dmg, 3, 2);
    if (hasPassive(target, "last_stand") && hpPercent(target) < 30) dmg = scale(ctx, "last_stand", dmg, 80, 100);
    return { amount: Math.max(0, dmg), crit, dodged: false, steps };
  } finally {
    delete ctx.damageSteps;
  }
}

// ---------------------------------------------------------------- HP/events

function pushEvent(ctx: BattleCtx, source: ActorState | null, target: ActorState, amount: number, type: string, skillId: string | null, crit: boolean, dodged: boolean, statusApplied: StatusAppliedDTO | null, steps?: DamageStep[]): void {
  const hpBefore = target.hp;
  let applied = amount;
  if (applied < 0) {
    const wouldBe = target.hp + applied;
    if (wouldBe <= 0 && target.hp > 0 && hasPassive(target, "vital_surge") && !target.vitalSurgeUsed) {
      target.vitalSurgeUsed = true;
      applied = 1 - target.hp;
      steps?.push({ kind: "vital_surge", inputs: [-amount, hpBefore], value: -applied }); // clamp to 1 instead of 0, classes.md 5.2
    }
  }
  const wasAlive = target.hp > 0;
  const clamped = Math.max(0, Math.min(target.maxHp, target.hp + applied));
  const actualDelta = clamped - target.hp;
  target.hp = clamped;
  const death = wasAlive && target.hp <= 0;
  ctx.events.push({
    ...(steps ? { damageBreakdown: { steps, damage: -amount || 0, hpBefore, hpLoss: -actualDelta || 0 } } : {}),
    round: ctx.round,
    type,
    sourceId: source ? source.id : null,
    targetId: target.id,
    amount: actualDelta,
    hpAfter: target.hp,
    skillId,
    crit,
    dodged,
    statusApplied,
    statusExpired: null,
    death,
  });
}

function applyStatus(actor: ActorState, statusId: StatusIdV2, duration: number, extra: Partial<StatusInstance> = {}): StatusAppliedDTO {
  const idx = actor.statuses.findIndex((s) => s.statusId === statusId);
  if (idx >= 0) actor.statuses.splice(idx, 1);
  const instance: StatusInstance = { statusId, duration, stacks: 1, tickAtk: 0, choirDodgeBonus: false, ...extra };
  actor.statuses.push(instance);
  return { statusId, duration, stacks: instance.stacks };
}

/** Explicit removal events let replay reconstruct state (including Choir dodge). */
function removeStatus(ctx: BattleCtx, source: ActorState, target: ActorState, statusId: StatusIdV2, skillId: string | null): void {
  const index = target.statuses.findIndex(s => s.statusId === statusId);
  if (index < 0) return;
  target.statuses.splice(index, 1);
  ctx.events.push({ round: ctx.round, type: "status_remove", sourceId: source.id, targetId: target.id,
    amount: 0, hpAfter: target.hp, skillId, crit: false, dodged: false,
    statusApplied: null, statusExpired: statusId, death: false });
}

/** Taunt is a per-side pointer (classes.md 6): applying a new one overwrites any other taunt on the same team. */
function applyTaunt(ctx: BattleCtx, actor: ActorState, duration: number): StatusAppliedDTO {
  for (const other of ctx.actors) {
    if (other !== actor && other.team === actor.team) {
      removeStatus(ctx, actor, other, "status_taunt", null);
    }
  }
  return applyStatus(actor, "status_taunt", duration);
}

/** classes.md 6's burn stacking rule, shared by Firebolt/Meteor/Hexblade's Backstab. Returns null if ignored (at cap). */
function applyBurn(ctx: BattleCtx, applier: ActorState, target: ActorState): StatusAppliedDTO | null {
  const cap = hasSynergy(applier, "Shadowflame") ? 4 : 3;
  const atk = readAtk(ctx, applier);
  const existing = target.statuses.find((s) => s.statusId === "status_burn");
  if (!existing) {
    target.statuses.push({ statusId: "status_burn", duration: 2, stacks: 1, tickAtk: atk, choirDodgeBonus: false });
    return { statusId: "status_burn", duration: 2, stacks: 1 };
  }
  if (existing.stacks >= cap) return null;
  existing.stacks += 1;
  existing.duration = 2;
  existing.tickAtk = atk;
  return { statusId: "status_burn", duration: 2, stacks: existing.stacks };
}

function withOpportunist(ctx: BattleCtx, actor: ActorState, target: ActorState, baseDmg: number): number {
  return hasPassive(actor, "opportunist") && hpPercent(target) < 50 ? scale(ctx, "opportunist", baseDmg, 6, 5) : baseDmg;
}

function setCooldown(actor: ActorState, skillId: string): void {
  const def = getSkillDefinition(skillId);
  let cd = def.cooldown;
  if (hasPassive(actor, "encore")) cd = Math.max(0, cd - 1);
  actor.cooldowns.set(skillId, cd);
}

// ------------------------------------------------------------- hero skills

/**
 * Every single-target/AoE offensive skill case below targets the opposing
 * side; if it died earlier this same round (an earlier-acting ally already
 * cleared it), there is nothing left to target — skip the action as a
 * no-op, same precedent M1's combat.ts used for a null-target spec branch.
 */
function opposingSideHasLivingMember(ctx: BattleCtx, actor: ActorState): boolean {
  return livingOnTeam(ctx.actors, opposingTeam(actor.team)).length > 0;
}

const OFFENSIVE_SKILL_IDS = new Set([
  "strike", "shield_bash", "smite", "quick_shot", "aimed_shot", "volley",
  "puncture", "backstab", "flurry", "arcane_bolt", "firebolt", "meteor",
  "rally_strike", "discordant_verse",
  "skill_warder_tap", "skill_weaver_thread", "skill_weaver_snare", "skill_weaver_unravel",
]);

function castSkill(ctx: BattleCtx, actor: ActorState, skillId: string): void {
  if (OFFENSIVE_SKILL_IDS.has(skillId) && !opposingSideHasLivingMember(ctx, actor)) return;
  switch (skillId) {
    // --------------------------------------------------------- Vanguard
    case "skill_warder_tap":
    case "skill_weaver_thread":
    case "strike": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, skillId, skillId, result.crit, result.dodged, null, result.steps);
      return;
    }
    case "bulwark_call": {
      const duration = hasSynergy(actor, "Banner Bearer") ? 3 : 2;
      pushEvent(ctx, actor, actor, 0, "bulwark_call", skillId, false, false, applyTaunt(ctx, actor, duration));
      pushEvent(ctx, actor, actor, 0, "bulwark_call", skillId, false, false, applyStatus(actor, "status_fortify", 2));
      const others = livingOnTeam(ctx.actors, actor.team).filter(a => a !== actor);
      if (hasSpec(actor, "vanguard_sentinel") && others.length) {
        const ally = pickLowestHpPercent(others);
        pushEvent(ctx, actor, ally, 0, skillId, skillId, false, false, applyStatus(ally, "status_fortify", 2));
      }
      setCooldown(actor, skillId);
      return;
    }
    case "shield_bash": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, hasSpec(actor, "vanguard_breaker")));
      const result = resolveHit(ctx, target, () => basic(ctx, scale(ctx, "shield_bash", readAtk(ctx, actor), 12, 10), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
      const statusDesc = result.dodged ? null : applyStatus(target, "status_weaken", 2);
      pushEvent(ctx, actor, target, -result.amount, "shield_bash", skillId, result.crit, result.dodged, statusDesc, result.steps);
      setCooldown(actor, skillId);
      return;
    }

    // ----------------------------------------------------------- Cleric
    case "smite": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, "smite", skillId, result.crit, result.dodged, null, result.steps);
      return;
    }
    case "mending_light": {
      const target = pickLowestHpPercent(livingOnTeam(ctx.actors, actor.team));
      let heal = Math.floor((readAtk(ctx, actor) * (hasSpec(actor, "cleric_triage") && hpPercent(target) < 30 ? 6 : 4)) / 5);
      if (hasPassive(actor, "devotion") && hpPercent(target) < 50) heal = Math.floor((heal * 6) / 5);
      const statusDesc = hasSynergy(actor, "Battle Medic") ? applyStatus(target, "status_fortify", 1) : null;
      pushEvent(ctx, actor, target, heal, "mending_light", skillId, false, false, statusDesc);
      setCooldown(actor, skillId);
      return;
    }
    case "sanctuary": {
      for (const ally of livingOnTeam(ctx.actors, actor.team).sort(bySlotIndex)) {
        pushEvent(ctx, actor, ally, 0, "sanctuary", skillId, false, false, applyStatus(ally, "status_regen", 3));
        if (hasSpec(actor, "cleric_shelter")) pushEvent(ctx, actor, ally, 0, skillId, skillId, false, false, applyStatus(ally, "status_fortify", 1));
      }
      setCooldown(actor, skillId);
      return;
    }

    // ----------------------------------------------------------- Ranger
    case "quick_shot": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, "quick_shot", skillId, result.crit, result.dodged, null, result.steps);
      return;
    }
    case "aimed_shot": {
      const pool = resolveSingleTargetPool(ctx, actor, false);
      const executeCandidates = pool.filter((t) => hpPercent(t) <= (hasSpec(actor, "ranger_tracker") ? 50 : 30));
      const bonus = executeCandidates.length > 0;
      const target = bonus ? pickLowestHp(executeCandidates) : pickLowestHp(pool);
      const result = resolveHit(
        ctx,
        target,
        () => {
          const dmg = basic(ctx, readAtk(ctx, actor), readDef(ctx, target));
          return bonus ? scale(ctx, "execute", dmg, 3, 2) : dmg;
        },
        { guaranteedCrit: false, critSource: actor },
      );
      pushEvent(ctx, actor, target, -result.amount, "aimed_shot", skillId, result.crit, result.dodged, null, result.steps);
      setCooldown(actor, skillId);
      return;
    }
    case "volley": {
      const pool = resolveAoEPool(ctx, actor, false);
      const sortedByHp = [...pool].sort((a, b) => (a.hp !== b.hp ? a.hp - b.hp : a.slotIndex - b.slotIndex));
      const targets = sortedByHp.slice(0, Math.min(hasSpec(actor, "ranger_scatter") ? 3 : 2, sortedByHp.length)).sort(bySlotIndex);
      const atkMul = hasSynergy(actor, "Marching Fire") ? 8 : 7;
      for (const target of targets) {
        const result = resolveHit(
          ctx,
          target,
          () => basic(ctx, scale(ctx, "volley", readAtk(ctx, actor), atkMul, 10), readDef(ctx, target)),
          { guaranteedCrit: false, critSource: actor },
        );
        pushEvent(ctx, actor, target, -result.amount, "volley", skillId, result.crit, result.dodged, null, result.steps);
      }
      setCooldown(actor, skillId);
      return;
    }

    // ------------------------------------------------------------ Rogue
    case "puncture": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => withOpportunist(ctx, actor, target, basic(ctx, readAtk(ctx, actor), readDef(ctx, target))), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, "puncture", skillId, result.crit, result.dodged, null, result.steps);
      return;
    }
    case "backstab": {
      const pool = resolveSingleTargetPool(ctx, actor, true);
      const target = hasSpec(actor, "rogue_duelist") ? pickHighestAtk(ctx, pool) : pickHighestSlotIndex(pool);
      const result = resolveHit(ctx, target, () => withOpportunist(ctx, actor, target, basic(ctx, readAtk(ctx, actor), readDef(ctx, target))), { guaranteedCrit: true, critSource: actor });
      const statusDesc = hasSynergy(actor, "Hexblade") ? applyBurn(ctx, actor, target) : null;
      pushEvent(ctx, actor, target, -result.amount, "backstab", skillId, true, false, statusDesc, result.steps);
      setCooldown(actor, skillId);
      return;
    }
    case "flurry": {
      let target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      for (let hit = 0; hit < 2; hit++) {
        if (hit === 1 && hasSpec(actor, "rogue_pursuer")) {
          const pool = resolveSingleTargetPool(ctx, actor, false);
          if (!pool.length) break;
          target = pickLowestHp(pool);
        }
        if (target.hp <= 0) break;
        const result = resolveHit(ctx, target, () => withOpportunist(ctx, actor, target, basic(ctx, readAtk(ctx, actor), readDef(ctx, target))), { guaranteedCrit: false, critSource: actor });
        pushEvent(ctx, actor, target, -result.amount, "flurry", skillId, result.crit, result.dodged, null, result.steps);
      }
      setCooldown(actor, skillId);
      return;
    }

    // --------------------------------------------------------- Arcanist
    case "arcane_bolt": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, "arcane_bolt", skillId, result.crit, result.dodged, null, result.steps);
      return;
    }
    case "firebolt": {
      const pool = resolveSingleTargetPool(ctx, actor, false);
      const target = hasSpec(actor, "arcanist_ember") ? pickHighestHp(pool) : pickLowestHp(pool);
      const result = resolveHit(
        ctx,
        target,
        () => {
          const dmg = basic(ctx, readAtk(ctx, actor), readDef(ctx, target));
          return hasPassive(actor, "overload") ? scale(ctx, "overload", dmg, 11, 10) : dmg;
        },
        { guaranteedCrit: false, critSource: actor },
      );
      const statusDesc = result.dodged ? null : applyBurn(ctx, actor, target);
      pushEvent(ctx, actor, target, -result.amount, "firebolt", skillId, result.crit, result.dodged, statusDesc, result.steps);
      setCooldown(actor, skillId);
      return;
    }
    case "meteor": {
      const pool = resolveAoEPool(ctx, actor, true);
      for (const target of [...pool].sort(bySlotIndex)) {
        if (hasSpec(actor, "arcanist_quench")) removeStatus(ctx, actor, target, "status_haste", skillId);
        const result = resolveHit(
          ctx,
          target,
          () => basic(ctx, scale(ctx, "meteor", readAtk(ctx, actor), 8, 10), readDef(ctx, target)),
          { guaranteedCrit: false, critSource: actor },
        );
        const statusDesc = result.dodged ? null : applyBurn(ctx, actor, target);
        pushEvent(ctx, actor, target, -result.amount, "meteor", skillId, result.crit, result.dodged, statusDesc, result.steps);
      }
      setCooldown(actor, skillId);
      return;
    }

    // ---------------------------------------------------------- Herald
    case "rally_strike": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(
        ctx,
        target,
        () => {
          const dmg = basic(ctx, readAtk(ctx, actor), readDef(ctx, target));
          const selfHasted = actor.statuses.some((s) => s.statusId === "status_haste");
          return hasPassive(actor, "battle_hymn") && selfHasted ? scale(ctx, "battle_hymn", dmg, 110, 100) : dmg;
        },
        { guaranteedCrit: false, critSource: actor },
      );
      pushEvent(ctx, actor, target, -result.amount, "rally_strike", skillId, result.crit, result.dodged, null, result.steps);
      return;
    }
    case "war_hymn": {
      const choir = hasSynergy(actor, "Choir");
      for (const ally of livingOnTeam(ctx.actors, actor.team).sort(bySlotIndex)) {
        if (hasSpec(actor, "herald_cadence")) removeStatus(ctx, actor, ally, "status_weaken", skillId);
        pushEvent(ctx, actor, ally, 0, "war_hymn", skillId, false, false, applyStatus(ally, "status_haste", 3, { choirDodgeBonus: choir }));
      }
      setCooldown(actor, skillId);
      return;
    }
    case "discordant_verse": {
      const pool = resolveSingleTargetPool(ctx, actor, hasSpec(actor, "herald_dissonance"));
      const target = hasSpec(actor, "herald_dissonance") ? pickHighestAtk(ctx, pool) : pickLowestHp(pool);
      pushEvent(ctx, actor, target, 0, "discordant_verse", skillId, false, false, applyStatus(target, "status_weaken", 2));
      setCooldown(actor, skillId);
      return;
    }

    case "skill_warder_brace": {
      const target = pickLowestHpPercent(livingOnTeam(ctx.actors, actor.team));
      pushEvent(ctx, actor, target, 0, skillId, skillId, false, false, applyStatus(target, "status_fortify", 2));
      if (hasSpec(actor, "warder_anchor")) pushEvent(ctx, actor, target, 0, skillId, skillId, false, false, applyTaunt(ctx, target, 1));
      setCooldown(actor, skillId);
      return;
    }
    case "skill_warder_repair": {
      const mender = hasSpec(actor, "warder_mender");
      const targets = livingOnTeam(ctx.actors, actor.team)
        .sort((a, b) => hpPercent(a) - hpPercent(b) || a.slotIndex - b.slotIndex)
        .slice(0, mender ? 2 : 1).sort(bySlotIndex);
      for (const target of targets) {
        const heal = Math.floor(readAtk(ctx, actor) * (mender ? 4 : 6) / 5);
        const status = hasPassive(actor, "skill_warder_aftercare") ? applyStatus(target, "status_regen", 2) : null;
        pushEvent(ctx, actor, target, heal, skillId, skillId, false, false, status);
      }
      setCooldown(actor, skillId);
      return;
    }
    case "skill_weaver_snare": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
      const status = result.dodged ? null : applyStatus(target, "status_weaken", 2);
      pushEvent(ctx, actor, target, -result.amount, skillId, skillId, result.crit, result.dodged, status, result.steps);
      if (!result.dodged && hasSpec(actor, "weaver_fray")) removeStatus(ctx, actor, target, "status_haste", skillId);
      setCooldown(actor, skillId);
      return;
    }
    case "skill_weaver_unravel": {
      const pool = resolveSingleTargetPool(ctx, actor, true);
      const fortified = pool.filter(a => a.statuses.some(s => s.statusId === "status_fortify"));
      const target = pickHighestAtk(ctx, hasSpec(actor, "weaver_sever") && fortified.length ? fortified : pool);
      removeStatus(ctx, actor, target, "status_fortify", skillId);
      const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, skillId, skillId, result.crit, result.dodged, null, result.steps);
      setCooldown(actor, skillId);
      return;
    }
    default:
      throw new Error(`combat3: no behavior implemented for skillId ${skillId}`);
  }
}

function chooseHeroSkill(actor: ActorState): string {
  for (const slot of actor.activeSkills) {
    if (!slot) continue;
    const cd = actor.cooldowns.get(slot) ?? 0;
    if (cd <= 0) return slot;
  }
  return basicAttackSkillId(actor.primaryClassId!);
}

function resolveHeroActionV2(ctx: BattleCtx, actor: ActorState): void {
  castSkill(ctx, actor, chooseHeroSkill(actor));
}

// -------------------------------------------------------- enemy/boss AI
// content.md section 3/5.2-5.3/6.2-6.4's "content-defined behavior" (combat.md
// 8.1 step 2), keyed by enemyId/bossId exactly as content.md's stat tables are.

function plainEnemyStrike(ctx: BattleCtx, actor: ActorState, ignoresRow: boolean): void {
  const target = pickLowestPosition(resolveSingleTargetPool(ctx, actor, ignoresRow));
  const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
  pushEvent(ctx, actor, target, -result.amount, "enemy_strike", null, result.crit, result.dodged, null, result.steps);
}

function brigandAction(ctx: BattleCtx, actor: ActorState): void {
  if (ctx.round % 4 === 0) {
    const target = pickLowestPosition(resolveSingleTargetPool(ctx, actor, false));
    const result = resolveHit(ctx, target, () => scale(ctx, "heavy_strike", basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), 3, 2), { guaranteedCrit: false, critSource: actor });
    const statusDesc = result.dodged ? null : applyStatus(target, "status_weaken", 2);
    pushEvent(ctx, actor, target, -result.amount, "crushing_blow", null, result.crit, result.dodged, statusDesc, result.steps);
  } else {
    plainEnemyStrike(ctx, actor, false);
  }
}

function wolfAction(ctx: BattleCtx, actor: ActorState): void {
  const pool = resolveSingleTargetPool(ctx, actor, false);
  const target = ctx.round % 2 === 1 ? pickLowestHp(pool) : pickLowestPosition(pool);
  const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
  pushEvent(ctx, actor, target, -result.amount, "enemy_strike", null, result.crit, result.dodged, null, result.steps);
}

function drownedAction(ctx: BattleCtx, actor: ActorState): void {
  const pool = resolveSingleTargetPool(ctx, actor, false);
  if (ctx.round % 3 === 0) {
    const target = pickLowestHpPercent(pool);
    pushEvent(ctx, actor, target, 0, "drowned_weaken", null, false, false, applyStatus(target, "status_weaken", 2));
  } else {
    const target = pickLowestHp(pool);
    const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
    pushEvent(ctx, actor, target, -result.amount, "enemy_strike", null, result.crit, result.dodged, null, result.steps);
  }
}

function currentAction(ctx: BattleCtx, actor: ActorState): void {
  const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, true));
  const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
  pushEvent(ctx, actor, target, -result.amount, "enemy_strike", null, result.crit, result.dodged, null, result.steps);
}

function broodlingAction(ctx: BattleCtx, actor: ActorState): void {
  const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
  const isSurge = ctx.round % 3 === 1;
  const result = resolveHit(
    ctx,
    target,
    () => {
      const dmg = basic(ctx, readAtk(ctx, actor), readDef(ctx, target));
      return isSurge ? scale(ctx, "brood_surge", dmg, 3, 2) : dmg;
    },
    { guaranteedCrit: false, critSource: actor },
  );
  pushEvent(ctx, actor, target, -result.amount, isSurge ? "brood_surge" : "enemy_strike", null, result.crit, result.dodged, null, result.steps);
}

function tollkeeperAction(ctx: BattleCtx, actor: ActorState): void {
  const pool = resolveSingleTargetPool(ctx, actor, true);
  if (ctx.round % 3 === 0) {
    const target = pickLowestHpPercent(pool);
    const result = resolveHit(ctx, target, () => scale(ctx, "heavy_strike", basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), 3, 2), { guaranteedCrit: false, critSource: actor });
    const statusDesc = result.dodged ? null : applyStatus(target, "status_weaken", 2);
    pushEvent(ctx, actor, target, -result.amount, "toll_smash", null, result.crit, result.dodged, statusDesc, result.steps);
  } else {
    const target = pickLowestPosition(pool);
    const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
    pushEvent(ctx, actor, target, -result.amount, "toll_strike", null, result.crit, result.dodged, null, result.steps);
  }
}

function drownedWardenAction(ctx: BattleCtx, actor: ActorState): void {
  const mod = ctx.round % 4;
  if (mod === 2) {
    const target = pickLowestHpPercent(resolveSingleTargetPool(ctx, actor, true));
    const result = resolveHit(ctx, target, () => scale(ctx, "heavy_strike", basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), 3, 2), { guaranteedCrit: false, critSource: actor });
    const statusDesc = result.dodged ? null : applyStatus(target, "status_weaken", 2);
    pushEvent(ctx, actor, target, -result.amount, "crushing_current", null, result.crit, result.dodged, statusDesc, result.steps);
  } else if (mod === 0) {
    const pool = resolveAoEPool(ctx, actor, true);
    for (const target of [...pool].sort(bySlotIndex)) {
      const result = resolveHit(
        ctx,
        target,
        () => basic(ctx, scale(ctx, "tidal_surge", readAtk(ctx, actor), 7, 10), readDef(ctx, target)),
        { guaranteedCrit: false, critSource: actor },
      );
      const statusDesc = result.dodged ? null : applyStatus(target, "status_weaken", 2);
      pushEvent(ctx, actor, target, -result.amount, "tidal_surge", null, result.crit, result.dodged, statusDesc, result.steps);
    }
  } else {
    const target = pickLowestPosition(resolveSingleTargetPool(ctx, actor, true));
    const result = resolveHit(ctx, target, () => basic(ctx, readAtk(ctx, actor), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
    pushEvent(ctx, actor, target, -result.amount, "wardens_grasp", null, result.crit, result.dodged, null, result.steps);
  }
}

function archiveAction(ctx: BattleCtx, actor: ActorState): void {
  const custodian = actor.enemyId === "boss_archive_custodian";
  if ((custodian && ctx.round % 4 === 1) || (!custodian && actor.enemyId === "enemy_archive_binder" && ctx.round % 3 === 1)) {
    pushEvent(ctx, actor, actor, 0, "archive_fortify", null, false, false, applyStatus(actor, "status_fortify", 2));
    return;
  }
  if (custodian && ctx.round % 4 === 0) {
    for (const target of resolveAoEPool(ctx, actor, true).sort(bySlotIndex)) {
      const result = resolveHit(ctx, target, () => basic(ctx, scale(ctx, "cinder_sweep", readAtk(ctx, actor), 7, 10), readDef(ctx, target)), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, "cinder_sweep", null, result.crit, result.dodged, null, result.steps);
    }
    return;
  }
  const index = custodian && ctx.round % 4 === 2;
  const pool = resolveSingleTargetPool(ctx, actor, index || actor.enemyId === "enemy_archive_spark");
  const target = index ? pickLowestHpPercent(pool) : pickLowestHp(pool);
  const result = resolveHit(ctx, target, () => {
    const damage = basic(ctx, readAtk(ctx, actor), readDef(ctx, target));
    return index ? scale(ctx, "archive_index", damage, 3, 2) : damage;
  }, { guaranteedCrit: false, critSource: actor });
  const status = index && !result.dodged ? applyStatus(target, "status_weaken", 2) : null;
  pushEvent(ctx, actor, target, -result.amount, index ? "archive_index" : "enemy_strike", null, result.crit, result.dodged, status, result.steps);
}

function resolveEnemyActionV2(ctx: BattleCtx, actor: ActorState): void {
  // Every enemy/boss action targets the opposing (hero) side only; if it
  // died earlier this same round, skip — same no-op precedent as castSkill.
  if (!opposingSideHasLivingMember(ctx, actor)) return;
  switch (actor.enemyId) {
    case "enemy_archive_binder":
    case "enemy_archive_spark":
    case "boss_archive_custodian":
      return archiveAction(ctx, actor);
    case "enemy_road_brigand":
      return brigandAction(ctx, actor);
    case "enemy_road_wolf":
      return wolfAction(ctx, actor);
    case "enemy_aqueduct_drowned":
      return drownedAction(ctx, actor);
    case "enemy_aqueduct_current":
      return currentAction(ctx, actor);
    case "enemy_depths_broodling":
      return broodlingAction(ctx, actor);
    case "boss_tollkeeper":
      return tollkeeperAction(ctx, actor);
    case "boss_drowned_warden":
      return drownedWardenAction(ctx, actor);
    case "enemy_road_cutpurse":
    case "enemy_aqueduct_husk":
      return plainEnemyStrike(ctx, actor, false);
    default:
      throw new Error(`combat3: unsupported enemy ${actor.enemyId}`);
  }
}

// -------------------------------------------------------------- round loop

function recomputeSpd(ctx: BattleCtx): void {
  for (const actor of ctx.actors) {
    if (actor.hp <= 0) continue;
    let spd = actor.baseline.spd;
    if (hasPassive(actor, "momentum")) {
      const deadOpposing = ctx.actors.filter((a) => a.team === opposingTeam(actor.team) && a.hp <= 0).length;
      spd += Math.min(5, deadOpposing);
    }
    if (actor.statuses.some((s) => s.statusId === "status_haste")) spd += 3;
    actor.currentSpd = spd;
  }
}

function speedOrderCompareV2(a: ActorState, b: ActorState): number {
  if (a.currentSpd !== b.currentSpd) return b.currentSpd - a.currentSpd;
  if (a.team !== b.team) return a.team === "A" ? -1 : 1;
  return a.slotIndex - b.slotIndex;
}

function tickStatuses(ctx: BattleCtx, order: readonly ActorState[]): void {
  for (const actor of order) {
    if (actor.hp <= 0) continue;
    const burn = actor.statuses.find((s) => s.statusId === "status_burn");
    if (burn) {
      const dmg = burn.stacks * Math.floor(burn.tickAtk / 3);
      pushEvent(ctx, null, actor, -dmg, "burn_tick", null, false, false, null, [{ kind: "burn", inputs: [burn.stacks, burn.tickAtk], value: dmg }]);
    }
  }
  for (const actor of order) {
    if (actor.hp <= 0) continue;
    const regen = actor.statuses.find((s) => s.statusId === "status_regen");
    if (regen) {
      const heal = Math.floor((actor.maxHp * 10) / 100);
      pushEvent(ctx, null, actor, heal, "regen_tick", null, false, false, null);
    }
  }
}

function decrementCooldownsAndStatuses(ctx: BattleCtx): void {
  for (const actor of ctx.actors) {
    for (const slot of actor.activeSkills) {
      if (!slot) continue;
      const cd = actor.cooldowns.get(slot);
      if (cd && cd > 0) actor.cooldowns.set(slot, cd - 1);
    }
    for (let i = actor.statuses.length - 1; i >= 0; i--) {
      const status = actor.statuses[i]!;
      status.duration -= 1;
      if (status.duration <= 0) {
        actor.statuses.splice(i, 1);
        ctx.events.push({
          round: ctx.round,
          type: "status_expire",
          sourceId: null,
          targetId: actor.id,
          amount: 0,
          hpAfter: actor.hp,
          skillId: null,
          crit: false,
          dodged: false,
          statusApplied: null,
          statusExpired: status.statusId,
          death: false,
        });
      }
    }
  }
}

function buildActor(input: CombatantInputV3, team: "A" | "B"): ActorState {
  if (input.kind === "hero") {
    const baseline = computeBattleStartStatsV3(input);
    return {
      id: input.id,
      team,
      kind: "hero",
      slotIndex: input.slotIndex,
      enemyId: null,
      isBoss: false,
      primaryClassId: input.primaryClassId,
      secondaryClassId: input.secondaryClassId,
      primarySpecializationId: input.primarySpecializationId,
      activeSkills: input.skillLoadout.active,
      passiveSkills: input.skillLoadout.passive,
      baseline,
      maxHp: baseline.maxHp,
      hp: baseline.maxHp,
      currentSpd: baseline.spd,
      statuses: [],
      cooldowns: new Map(),
      vitalSurgeUsed: false,
    };
  }
  const baseline: EffectiveStatsV2 = { maxHp: input.stats.maxHp, atk: input.stats.atk, def: input.stats.def, spd: input.stats.spd };
  return {
    id: input.id,
    team,
    kind: "enemy",
    slotIndex: input.slotIndex,
    enemyId: input.enemyId,
    isBoss: input.isBoss ?? false,
    primaryClassId: null,
    secondaryClassId: null,
    primarySpecializationId: null,
    activeSkills: ["", ""],
    passiveSkills: ["", ""],
    baseline,
    maxHp: baseline.maxHp,
    hp: baseline.maxHp,
    currentSpd: baseline.spd,
    statuses: [],
    cooldowns: new Map(),
    vitalSurgeUsed: false,
  };
}

function toUnitSummary(actor: ActorState): BattleUnitSummaryV2 {
  return {
    unitId: actor.id,
    side: actor.team,
    kind: actor.kind,
    classId: actor.primaryClassId,
    secondaryClassId: actor.secondaryClassId,
    enemyId: actor.enemyId,
    slotIndex: actor.slotIndex,
    maxHp: actor.maxHp,
  };
}

/**
 * Simulates a full battle per combat.md section 8 / classes.md sections 2-6.
 * `sideA` is always "the account's own party" (team A, per BattleUnitDTO's
 * `side` convention); `sideB` is enemies/boss (PvE/boss) or the opposing
 * hero team (arena) — both use the identical round loop, since combat.md 8.1
 * explicitly generalizes M1's "enemy"/"hero" framing to "opposing side."
 */
export function simulateBattleV3(sideA: readonly CombatantInputV3[], sideB: readonly CombatantInputV3[], kind: BattleKindV2, rngSeed: number): BattleResultV2 {
  const ids = new Set<string>();
  for (const side of [sideA, sideB]) {
    if (side.length < 1 || side.length > 5) throw new Error("M3 battle side requires 1..5 units");
    const slots = new Set<number>();
    for (const unit of side) {
      if (!unit.id || ids.has(unit.id)) throw new Error("M3 battle IDs must be distinct across both sides");
      ids.add(unit.id);
      if (!Number.isInteger(unit.slotIndex) || unit.slotIndex < 0 || unit.slotIndex > 4 || slots.has(unit.slotIndex)) throw new Error("Invalid M3 battle formation");
      slots.add(unit.slotIndex);
      if (unit.kind === "enemy" && Object.entries(unit.stats).some(([key, value]) => !Number.isSafeInteger(value) || value < (key === "def" ? 0 : 1))) throw new Error("Invalid M3 enemy stats");
    }
  }
  const ctx: BattleCtx = {
    actors: [...[...sideA].sort((a, b) => a.slotIndex - b.slotIndex).map((c) => buildActor(c, "A")),
      ...[...sideB].sort((a, b) => a.slotIndex - b.slotIndex).map((c) => buildActor(c, "B"))],
    events: [],
    round: 1,
    rngState: createRngState(rngSeed),
  };

  let result: BattleResultKindV2 | null = null;

  while (ctx.round <= 100) {
    recomputeSpd(ctx);
    const order = ctx.actors.filter((a) => a.hp > 0).sort(speedOrderCompareV2);

    for (const actor of order) {
      if (actor.hp <= 0) continue;
      if (actor.kind === "hero") resolveHeroActionV2(ctx, actor);
      else resolveEnemyActionV2(ctx, actor);
    }

    tickStatuses(ctx, order);
    decrementCooldownsAndStatuses(ctx);

    const aAlive = ctx.actors.some((a) => a.team === "A" && a.hp > 0);
    const bAlive = ctx.actors.some((a) => a.team === "B" && a.hp > 0);
    if (!aAlive && !bAlive) {
      result = kind === "arena" ? "draw" : "loss";
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
    if (ctx.round === 100) {
      result = kind === "arena" ? "draw" : "loss";
      break;
    }
    ctx.round += 1;
  }

  const finalHp: Record<string, number> = {};
  for (const a of ctx.actors) finalHp[a.id] = a.hp;

  return { result: result!, rounds: ctx.round, events: ctx.events, finalHp, units: ctx.actors.map(toUnitSummary) };
}
