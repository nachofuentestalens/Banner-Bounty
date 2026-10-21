// Combat v2 engine (design/game/combat.md section 8, design/game/classes.md
// sections 2-6). Pure and deterministic: given the same participants,
// loadouts, formation and rngSeed, simulateBattleV2 always produces the same
// result/events (combat.md 8.7's "same seed/log -> same replay").
//
// Division of labor matches the existing M1 combat.ts: packages/content
// fixes IDs/unlock-levels/cooldowns/stats; this file hardcodes every skill's
// exact formula from classes.md section 5 / content.md's M2-31 addition,
// same precedent M1's combat.ts already used for spec formulas.

import {
  type ClassId,
  basicAttackSkillId,
  getSkillDefinition,
  hasSynergy as classHasSynergy,
} from "@banner-and-bounty/content";
import { createRngState, drawUint32, type RngState } from "./rng.js";
import { type EquipmentV2, type EffectiveStatsV2, applyPercentModifier, computeBattleStartStats } from "./stats2.js";

export type BattleKindV2 = "pve" | "boss" | "arena";
export type BattleResultKindV2 = "win" | "loss" | "draw";
export type StatusIdV2 = "status_burn" | "status_weaken" | "status_fortify" | "status_haste" | "status_regen" | "status_taunt";

export interface HeroCombatantInputV2 {
  readonly id: string;
  readonly slotIndex: number; // 0-4; 0-2 front row, 3-4 back row
  readonly primaryClassId: ClassId;
  readonly secondaryClassId: ClassId | null;
  readonly level: number;
  readonly equipment: EquipmentV2;
  readonly skillLoadout: { readonly active: readonly [string, string]; readonly passive: readonly [string, string] };
}

export interface EnemyCombatantInputV2 {
  readonly id: string;
  readonly slotIndex: number;
  readonly enemyId: string;
  readonly stats: { readonly maxHp: number; readonly atk: number; readonly def: number; readonly spd: number };
  readonly isBoss?: boolean;
}

export type CombatantInputV2 =
  | ({ readonly kind: "hero" } & HeroCombatantInputV2)
  | ({ readonly kind: "enemy" } & EnemyCombatantInputV2);

export interface StatusAppliedDTO {
  readonly statusId: string;
  readonly duration: number;
  readonly stacks?: number;
}

export interface BattleEventV2 {
  readonly round: number;
  readonly type: string;
  readonly sourceId: string | null;
  readonly targetId: string | null;
  readonly amount: number;
  readonly hpAfter: number | null;
  readonly skillId: string | null;
  readonly crit: boolean;
  readonly dodged: boolean;
  readonly statusApplied: StatusAppliedDTO | null;
  readonly statusExpired: string | null;
  readonly death: boolean;
}

export interface BattleUnitSummaryV2 {
  readonly unitId: string;
  readonly side: "A" | "B";
  readonly kind: "hero" | "enemy";
  readonly classId: string | null;
  readonly secondaryClassId: string | null;
  readonly slotIndex: number;
  readonly maxHp: number;
}

export interface BattleResultV2 {
  readonly result: BattleResultKindV2;
  readonly rounds: number;
  readonly events: readonly BattleEventV2[];
  readonly finalHp: Readonly<Record<string, number>>;
  readonly units: readonly BattleUnitSummaryV2[];
}

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

function basic(atk: number, targetDef: number): number {
  return Math.max(1, atk - Math.floor(targetDef / 2));
}

/** classes.md 2.1 steps 6-7 for ATK: Arcane Reserve (dynamic passive, +10% while any opposing unit burns), then status_weaken (-30%). */
function readAtk(ctx: BattleCtx, actor: ActorState): number {
  let v = actor.baseline.atk;
  if (hasPassive(actor, "arcane_reserve")) {
    const opposing = opposingTeam(actor.team);
    const anyBurning = livingOnTeam(ctx.actors, opposing).some((a) => a.statuses.some((s) => s.statusId === "status_burn"));
    if (anyBurning) v = applyPercentModifier(v, 10);
  }
  if (actor.statuses.some((s) => s.statusId === "status_weaken")) v = applyPercentModifier(v, -30);
  return v;
}

/** classes.md 2.1 step 7 for DEF: status_fortify (+30%). No dynamic DEF passive exists in this kit. */
function readDef(actor: ActorState): number {
  let v = actor.baseline.def;
  if (actor.statuses.some((s) => s.statusId === "status_fortify")) v = applyPercentModifier(v, 30);
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
  if (target.statuses.some((s) => s.statusId === "status_haste" && s.choirDodgeBonus)) chance += 5;
  return Math.max(0, Math.min(50, chance));
}

function critChanceFor(source: ActorState): number {
  let chance = 10;
  if (hasPassive(source, "hunters_focus")) chance += 15;
  return Math.max(0, Math.min(75, chance));
}

interface HitResult {
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
  if (!opts.guaranteedCrit) {
    const r1 = rollPercent(ctx);
    if (r1 < dodgeChanceFor(target)) return { amount: 0, crit: false, dodged: true };
  }
  const crit = opts.guaranteedCrit || rollPercent(ctx) < critChanceFor(opts.critSource);
  let dmg = computeBaseDamage();
  if (crit) dmg = Math.floor((dmg * 3) / 2);
  if (hasPassive(target, "last_stand") && hpPercent(target) < 30) dmg = Math.floor((dmg * 80) / 100);
  return { amount: Math.max(0, dmg), crit, dodged: false };
}

// ---------------------------------------------------------------- HP/events

function pushEvent(ctx: BattleCtx, source: ActorState | null, target: ActorState, amount: number, type: string, skillId: string | null, crit: boolean, dodged: boolean, statusApplied: StatusAppliedDTO | null): void {
  let applied = amount;
  if (applied < 0) {
    const wouldBe = target.hp + applied;
    if (wouldBe <= 0 && target.hp > 0 && hasPassive(target, "vital_surge") && !target.vitalSurgeUsed) {
      target.vitalSurgeUsed = true;
      applied = 1 - target.hp; // clamp to 1 instead of 0, classes.md 5.2
    }
  }
  const wasAlive = target.hp > 0;
  const clamped = Math.max(0, Math.min(target.maxHp, target.hp + applied));
  const actualDelta = clamped - target.hp;
  target.hp = clamped;
  const death = wasAlive && target.hp <= 0;
  ctx.events.push({
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

/** Taunt is a per-side pointer (classes.md 6): applying a new one overwrites any other taunt on the same team. */
function applyTaunt(ctx: BattleCtx, actor: ActorState, duration: number): StatusAppliedDTO {
  for (const other of ctx.actors) {
    if (other !== actor && other.team === actor.team) {
      const idx = other.statuses.findIndex((s) => s.statusId === "status_taunt");
      if (idx >= 0) other.statuses.splice(idx, 1);
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

function withOpportunist(actor: ActorState, target: ActorState, baseDmg: number): number {
  return hasPassive(actor, "opportunist") && hpPercent(target) < 50 ? Math.floor((baseDmg * 6) / 5) : baseDmg;
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
]);

function castSkill(ctx: BattleCtx, actor: ActorState, skillId: string): void {
  if (OFFENSIVE_SKILL_IDS.has(skillId) && !opposingSideHasLivingMember(ctx, actor)) return;
  switch (skillId) {
    // --------------------------------------------------------- Vanguard
    case "strike": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => basic(readAtk(ctx, actor), readDef(target)), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, "strike", skillId, result.crit, result.dodged, null);
      return;
    }
    case "bulwark_call": {
      const duration = hasSynergy(actor, "Banner Bearer") ? 3 : 2;
      pushEvent(ctx, actor, actor, 0, "bulwark_call", skillId, false, false, applyTaunt(ctx, actor, duration));
      pushEvent(ctx, actor, actor, 0, "bulwark_call", skillId, false, false, applyStatus(actor, "status_fortify", 2));
      setCooldown(actor, skillId);
      return;
    }
    case "shield_bash": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => Math.max(1, Math.floor((readAtk(ctx, actor) * 12) / 10) - Math.floor(readDef(target) / 2)), { guaranteedCrit: false, critSource: actor });
      const statusDesc = result.dodged ? null : applyStatus(target, "status_weaken", 2);
      pushEvent(ctx, actor, target, -result.amount, "shield_bash", skillId, result.crit, result.dodged, statusDesc);
      setCooldown(actor, skillId);
      return;
    }

    // ----------------------------------------------------------- Cleric
    case "smite": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => basic(readAtk(ctx, actor), readDef(target)), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, "smite", skillId, result.crit, result.dodged, null);
      return;
    }
    case "mending_light": {
      const target = pickLowestHpPercent(livingOnTeam(ctx.actors, actor.team));
      let heal = Math.floor((readAtk(ctx, actor) * 4) / 5);
      if (hasPassive(actor, "devotion") && hpPercent(target) < 50) heal = Math.floor((heal * 6) / 5);
      const statusDesc = hasSynergy(actor, "Battle Medic") ? applyStatus(target, "status_fortify", 1) : null;
      pushEvent(ctx, actor, target, heal, "mending_light", skillId, false, false, statusDesc);
      setCooldown(actor, skillId);
      return;
    }
    case "sanctuary": {
      for (const ally of livingOnTeam(ctx.actors, actor.team).sort(bySlotIndex)) {
        pushEvent(ctx, actor, ally, 0, "sanctuary", skillId, false, false, applyStatus(ally, "status_regen", 3));
      }
      setCooldown(actor, skillId);
      return;
    }

    // ----------------------------------------------------------- Ranger
    case "quick_shot": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => basic(readAtk(ctx, actor), readDef(target)), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, "quick_shot", skillId, result.crit, result.dodged, null);
      return;
    }
    case "aimed_shot": {
      const pool = resolveSingleTargetPool(ctx, actor, false);
      const executeCandidates = pool.filter((t) => hpPercent(t) <= 30);
      const bonus = executeCandidates.length > 0;
      const target = bonus ? pickLowestHp(executeCandidates) : pickLowestHp(pool);
      const result = resolveHit(
        ctx,
        target,
        () => {
          const dmg = basic(readAtk(ctx, actor), readDef(target));
          return bonus ? Math.floor((dmg * 3) / 2) : dmg;
        },
        { guaranteedCrit: false, critSource: actor },
      );
      pushEvent(ctx, actor, target, -result.amount, "aimed_shot", skillId, result.crit, result.dodged, null);
      setCooldown(actor, skillId);
      return;
    }
    case "volley": {
      const pool = resolveAoEPool(ctx, actor, false);
      const sortedByHp = [...pool].sort((a, b) => (a.hp !== b.hp ? a.hp - b.hp : a.slotIndex - b.slotIndex));
      const targets = sortedByHp.slice(0, Math.min(2, sortedByHp.length)).sort(bySlotIndex);
      const atkMul = hasSynergy(actor, "Marching Fire") ? 8 : 7;
      for (const target of targets) {
        const result = resolveHit(
          ctx,
          target,
          () => Math.max(1, Math.floor((readAtk(ctx, actor) * atkMul) / 10) - Math.floor(readDef(target) / 2)),
          { guaranteedCrit: false, critSource: actor },
        );
        pushEvent(ctx, actor, target, -result.amount, "volley", skillId, result.crit, result.dodged, null);
      }
      setCooldown(actor, skillId);
      return;
    }

    // ------------------------------------------------------------ Rogue
    case "puncture": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => withOpportunist(actor, target, basic(readAtk(ctx, actor), readDef(target))), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, "puncture", skillId, result.crit, result.dodged, null);
      return;
    }
    case "backstab": {
      const target = pickHighestSlotIndex(resolveSingleTargetPool(ctx, actor, true));
      const result = resolveHit(ctx, target, () => withOpportunist(actor, target, basic(readAtk(ctx, actor), readDef(target))), { guaranteedCrit: true, critSource: actor });
      const statusDesc = hasSynergy(actor, "Hexblade") ? applyBurn(ctx, actor, target) : null;
      pushEvent(ctx, actor, target, -result.amount, "backstab", skillId, true, false, statusDesc);
      setCooldown(actor, skillId);
      return;
    }
    case "flurry": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      for (let hit = 0; hit < 2; hit++) {
        if (target.hp <= 0) break;
        const result = resolveHit(ctx, target, () => withOpportunist(actor, target, basic(readAtk(ctx, actor), readDef(target))), { guaranteedCrit: false, critSource: actor });
        pushEvent(ctx, actor, target, -result.amount, "flurry", skillId, result.crit, result.dodged, null);
      }
      setCooldown(actor, skillId);
      return;
    }

    // --------------------------------------------------------- Arcanist
    case "arcane_bolt": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(ctx, target, () => basic(readAtk(ctx, actor), readDef(target)), { guaranteedCrit: false, critSource: actor });
      pushEvent(ctx, actor, target, -result.amount, "arcane_bolt", skillId, result.crit, result.dodged, null);
      return;
    }
    case "firebolt": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      const result = resolveHit(
        ctx,
        target,
        () => {
          const dmg = basic(readAtk(ctx, actor), readDef(target));
          return hasPassive(actor, "overload") ? Math.floor((dmg * 11) / 10) : dmg;
        },
        { guaranteedCrit: false, critSource: actor },
      );
      const statusDesc = result.dodged ? null : applyBurn(ctx, actor, target);
      pushEvent(ctx, actor, target, -result.amount, "firebolt", skillId, result.crit, result.dodged, statusDesc);
      setCooldown(actor, skillId);
      return;
    }
    case "meteor": {
      const pool = resolveAoEPool(ctx, actor, true);
      for (const target of [...pool].sort(bySlotIndex)) {
        const result = resolveHit(
          ctx,
          target,
          () => Math.max(1, Math.floor((readAtk(ctx, actor) * 8) / 10) - Math.floor(readDef(target) / 2)),
          { guaranteedCrit: false, critSource: actor },
        );
        const statusDesc = result.dodged ? null : applyBurn(ctx, actor, target);
        pushEvent(ctx, actor, target, -result.amount, "meteor", skillId, result.crit, result.dodged, statusDesc);
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
          const dmg = basic(readAtk(ctx, actor), readDef(target));
          const selfHasted = actor.statuses.some((s) => s.statusId === "status_haste");
          return hasPassive(actor, "battle_hymn") && selfHasted ? Math.floor((dmg * 110) / 100) : dmg;
        },
        { guaranteedCrit: false, critSource: actor },
      );
      pushEvent(ctx, actor, target, -result.amount, "rally_strike", skillId, result.crit, result.dodged, null);
      return;
    }
    case "war_hymn": {
      const choir = hasSynergy(actor, "Choir");
      for (const ally of livingOnTeam(ctx.actors, actor.team).sort(bySlotIndex)) {
        pushEvent(ctx, actor, ally, 0, "war_hymn", skillId, false, false, applyStatus(ally, "status_haste", 3, { choirDodgeBonus: choir }));
      }
      setCooldown(actor, skillId);
      return;
    }
    case "discordant_verse": {
      const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
      pushEvent(ctx, actor, target, 0, "discordant_verse", skillId, false, false, applyStatus(target, "status_weaken", 2));
      setCooldown(actor, skillId);
      return;
    }

    default:
      throw new Error(`combat2: no behavior implemented for skillId ${skillId}`);
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
  const result = resolveHit(ctx, target, () => basic(readAtk(ctx, actor), readDef(target)), { guaranteedCrit: false, critSource: actor });
  pushEvent(ctx, actor, target, -result.amount, "enemy_strike", null, result.crit, result.dodged, null);
}

function brigandAction(ctx: BattleCtx, actor: ActorState): void {
  if (ctx.round % 4 === 0) {
    const target = pickLowestPosition(resolveSingleTargetPool(ctx, actor, false));
    const result = resolveHit(ctx, target, () => Math.floor((basic(readAtk(ctx, actor), readDef(target)) * 3) / 2), { guaranteedCrit: false, critSource: actor });
    const statusDesc = result.dodged ? null : applyStatus(target, "status_weaken", 2);
    pushEvent(ctx, actor, target, -result.amount, "crushing_blow", null, result.crit, result.dodged, statusDesc);
  } else {
    plainEnemyStrike(ctx, actor, false);
  }
}

function wolfAction(ctx: BattleCtx, actor: ActorState): void {
  const pool = resolveSingleTargetPool(ctx, actor, false);
  const target = ctx.round % 2 === 1 ? pickLowestHp(pool) : pickLowestPosition(pool);
  const result = resolveHit(ctx, target, () => basic(readAtk(ctx, actor), readDef(target)), { guaranteedCrit: false, critSource: actor });
  pushEvent(ctx, actor, target, -result.amount, "enemy_strike", null, result.crit, result.dodged, null);
}

function drownedAction(ctx: BattleCtx, actor: ActorState): void {
  const pool = resolveSingleTargetPool(ctx, actor, false);
  if (ctx.round % 3 === 0) {
    const target = pickLowestHpPercent(pool);
    pushEvent(ctx, actor, target, 0, "drowned_weaken", null, false, false, applyStatus(target, "status_weaken", 2));
  } else {
    const target = pickLowestHp(pool);
    const result = resolveHit(ctx, target, () => basic(readAtk(ctx, actor), readDef(target)), { guaranteedCrit: false, critSource: actor });
    pushEvent(ctx, actor, target, -result.amount, "enemy_strike", null, result.crit, result.dodged, null);
  }
}

function currentAction(ctx: BattleCtx, actor: ActorState): void {
  const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, true));
  const result = resolveHit(ctx, target, () => basic(readAtk(ctx, actor), readDef(target)), { guaranteedCrit: false, critSource: actor });
  pushEvent(ctx, actor, target, -result.amount, "enemy_strike", null, result.crit, result.dodged, null);
}

function broodlingAction(ctx: BattleCtx, actor: ActorState): void {
  const target = pickLowestHp(resolveSingleTargetPool(ctx, actor, false));
  const isSurge = ctx.round % 3 === 1;
  const result = resolveHit(
    ctx,
    target,
    () => {
      const dmg = basic(readAtk(ctx, actor), readDef(target));
      return isSurge ? Math.floor((dmg * 3) / 2) : dmg;
    },
    { guaranteedCrit: false, critSource: actor },
  );
  pushEvent(ctx, actor, target, -result.amount, isSurge ? "brood_surge" : "enemy_strike", null, result.crit, result.dodged, null);
}

function tollkeeperAction(ctx: BattleCtx, actor: ActorState): void {
  const pool = resolveSingleTargetPool(ctx, actor, true);
  if (ctx.round % 3 === 0) {
    const target = pickLowestHpPercent(pool);
    const result = resolveHit(ctx, target, () => Math.floor((basic(readAtk(ctx, actor), readDef(target)) * 3) / 2), { guaranteedCrit: false, critSource: actor });
    const statusDesc = result.dodged ? null : applyStatus(target, "status_weaken", 2);
    pushEvent(ctx, actor, target, -result.amount, "toll_smash", null, result.crit, result.dodged, statusDesc);
  } else {
    const target = pickLowestPosition(pool);
    const result = resolveHit(ctx, target, () => basic(readAtk(ctx, actor), readDef(target)), { guaranteedCrit: false, critSource: actor });
    pushEvent(ctx, actor, target, -result.amount, "toll_strike", null, result.crit, result.dodged, null);
  }
}

function drownedWardenAction(ctx: BattleCtx, actor: ActorState): void {
  const mod = ctx.round % 4;
  if (mod === 2) {
    const target = pickLowestHpPercent(resolveSingleTargetPool(ctx, actor, true));
    const result = resolveHit(ctx, target, () => Math.floor((basic(readAtk(ctx, actor), readDef(target)) * 3) / 2), { guaranteedCrit: false, critSource: actor });
    const statusDesc = result.dodged ? null : applyStatus(target, "status_weaken", 2);
    pushEvent(ctx, actor, target, -result.amount, "crushing_current", null, result.crit, result.dodged, statusDesc);
  } else if (mod === 0) {
    const pool = resolveAoEPool(ctx, actor, true);
    for (const target of [...pool].sort(bySlotIndex)) {
      const result = resolveHit(
        ctx,
        target,
        () => Math.max(1, Math.floor((readAtk(ctx, actor) * 7) / 10) - Math.floor(readDef(target) / 2)),
        { guaranteedCrit: false, critSource: actor },
      );
      const statusDesc = result.dodged ? null : applyStatus(target, "status_weaken", 2);
      pushEvent(ctx, actor, target, -result.amount, "tidal_surge", null, result.crit, result.dodged, statusDesc);
    }
  } else {
    const target = pickLowestPosition(resolveSingleTargetPool(ctx, actor, true));
    const result = resolveHit(ctx, target, () => basic(readAtk(ctx, actor), readDef(target)), { guaranteedCrit: false, critSource: actor });
    pushEvent(ctx, actor, target, -result.amount, "wardens_grasp", null, result.crit, result.dodged, null);
  }
}

function resolveEnemyActionV2(ctx: BattleCtx, actor: ActorState): void {
  // Every enemy/boss action targets the opposing (hero) side only; if it
  // died earlier this same round, skip — same no-op precedent as castSkill.
  if (!opposingSideHasLivingMember(ctx, actor)) return;
  switch (actor.enemyId) {
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
    default:
      return plainEnemyStrike(ctx, actor, false);
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
      pushEvent(ctx, null, actor, -dmg, "burn_tick", null, false, false, null);
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

function buildActor(input: CombatantInputV2, team: "A" | "B"): ActorState {
  if (input.kind === "hero") {
    const baseline = computeBattleStartStats({
      primaryClassId: input.primaryClassId,
      secondaryClassId: input.secondaryClassId,
      level: input.level,
      equipment: input.equipment,
      hasThickHide: input.skillLoadout.passive.includes("thick_hide"),
    });
    return {
      id: input.id,
      team,
      kind: "hero",
      slotIndex: input.slotIndex,
      enemyId: null,
      isBoss: false,
      primaryClassId: input.primaryClassId,
      secondaryClassId: input.secondaryClassId,
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
export function simulateBattleV2(sideA: readonly CombatantInputV2[], sideB: readonly CombatantInputV2[], kind: BattleKindV2, rngSeed: number): BattleResultV2 {
  const ctx: BattleCtx = {
    actors: [...sideA.map((c) => buildActor(c, "A")), ...sideB.map((c) => buildActor(c, "B"))],
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
