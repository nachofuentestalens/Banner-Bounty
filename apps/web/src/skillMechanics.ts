// Display-only transcription of design/game/classes.md section 5 (M2-22).
// No client simulation: ATK/DEF are current effective stats; every division floors.
const MECHANICS: Record<string, string> = {
  "strike": "Basic. Unlock level 1. Target: Default enemy targeting (row-respecting, lowest HP). basic(ATK, targetDEF) damage.",
  "bulwark_call": "Active. Unlock level 1. Cooldown: 3 rounds. Target: Self. No damage. Applies status_taunt (self) for 2 rounds (3 with Banner Bearer) and status_fortify (self, +30% DEF) for 2 rounds.",
  "shield_bash": "Active. Unlock level 5. Cooldown: 2 rounds. Target: Default enemy targeting (row-respecting, lowest HP). max(1, floor(ATK*12/10) - floor(targetDEF/2)) damage; applies status_weaken (-30% ATK, 2 rounds) to the target.",
  "thick_hide": "Passive. Unlock level 1. Target: Self, battle-start-fixed. Effective DEF +15% (step 2.1.5 percentage layer).",
  "last_stand": "Passive. Unlock level 8. Target: Self, dynamically rechecked. Whenever this Vanguard would take damage while its current hpPercent < 30, that damage is reduced 20% (floor(damage*80/100)) before applying. Rechecked at every hit, not a one-time snapshot.",
  "smite": "Basic. Unlock level 1. Target: Default enemy targeting (row-respecting, lowest HP). basic(ATK, targetDEF) damage.",
  "mending_light": "Active. Unlock level 1. Cooldown: 2 rounds. Target: Lowest-HP%-living ally (ties by lowest slot index; self-eligible). Heal floor(ATK*4/5), clamped to max HP. (+Battle Medic synergy: also status_fortify +30% DEF, 1 round, on the target.)",
  "sanctuary": "Active. Unlock level 5. Cooldown: 4 rounds. Target: All living allies (AoE, ignores row — ally-targeting is never row-gated). No direct heal. Applies status_regen (heal 10% max HP, floor, per round) for 3 rounds to every living ally.",
  "devotion": "Passive. Unlock level 1. Target: Self, dynamically rechecked. If Mending Light's target's hpPercent < 50 at the moment of casting, that heal is floor(heal*6/5) instead.",
  "vital_surge": "Passive. Unlock level 8. Target: Self, one-time per battle. The first time this Cleric's HP would be clamped to 0, it is instead clamped to 1 and this passive is consumed for the rest of the battle (logged explicitly in the event, section 6 of combat.md's addition).",
  "quick_shot": "Basic. Unlock level 1. Target: Default enemy targeting (row-respecting, lowest HP). basic(ATK, targetDEF) damage.",
  "aimed_shot": "Active. Unlock level 1. Cooldown: 2 rounds. Target: Among row-respecting valid enemies at hpPercent <= 30, lowest HP (tie by slot index); else falls back to default targeting. basic(ATK, targetDEF), then floor(damage*3/2) only if an execute-threshold target was found (fallback shot gets no bonus).",
  "volley": "Active. Unlock level 5. Cooldown: 3 rounds. Target: Up to 2 lowest-HP row-respecting valid enemies (1 if only 1 exists). Per target: attenuatedATK = floor(ATK*7/10) (8/10 with Marching Fire synergy); max(1, attenuatedATK - floor(targetDEF/2)) damage, independent crit/dodge roll per target.",
  "hunters_focus": "Passive. Unlock level 1. Target: Self, battle-start-fixed. +15% crit chance (flat add to the base rate in combat.md's addition).",
  "momentum": "Passive. Unlock level 8. Target: Self, dynamically rechecked every round. +1 effective SPD per currently-dead opposing-side unit, capped at +5; recomputed at the start of every round's speed-order step (section 1 of combat.md's addition), not battle-start-fixed.",
  "puncture": "Basic. Unlock level 1. Target: Default enemy targeting (row-respecting, lowest HP). basic(ATK, targetDEF) damage.",
  "backstab": "Active. Unlock level 1. Cooldown: 2 rounds. Target: The opposing side's highest-slot-index living member if one exists (ignores row protection); else falls back to default targeting. basic(ATK, targetDEF) damage, guaranteed critical (no dodge/crit roll — always applies the crit multiplier from combat.md's addition). (+Hexblade synergy: also applies 1 status_burn stack, duration 2, if the hit lands.)",
  "flurry": "Active. Unlock level 5. Cooldown: 3 rounds. Target: Default enemy targeting (row-respecting, lowest HP), resolved once. Two sequential basic(ATK, targetDEF) hits on the same target, each with its own independent crit/dodge roll.",
  "opportunist": "Passive. Unlock level 1. Target: Self, dynamically rechecked. +20% damage (floor(damage*6/5)) on any of this Rogue's own hits (Basic Attack, Backstab, Flurry) against a target whose hpPercent < 50 at the moment of the hit.",
  "evasion": "Passive. Unlock level 8. Target: Self, battle-start-fixed. +15% dodge chance (flat add) when this Rogue is the target of an offensive action.",
  "arcane_bolt": "Basic. Unlock level 1. Target: Default enemy targeting (row-respecting, lowest HP). basic(ATK, targetDEF) damage.",
  "firebolt": "Active. Unlock level 1. Cooldown: 0 rounds. Target: Default enemy targeting (row-respecting, lowest HP). basic(ATK, targetDEF) damage; applies/refreshes status_burn per section 6's stacking rule.",
  "meteor": "Active. Unlock level 5. Cooldown: 4 rounds. Target: All living opposing-side units (AoE, ignores row protection). Per target: attenuatedATK = floor(ATK*8/10); max(1, attenuatedATK - floor(targetDEF/2)) damage, independent crit/dodge roll per target; applies 1 status_burn stack (duration 2) to each target not already at its stack cap.",
  "overload": "Passive. Unlock level 1. Target: Self, dynamically rechecked. Firebolt's direct-hit damage (not Burn ticks) is floor(damage*11/10) instead.",
  "arcane_reserve": "Passive. Unlock level 8. Target: Self, dynamically rechecked. +10% effective ATK (percentage layer, applied at formula-evaluation time, not battle-start-fixed) while at least one opposing-side unit currently holds an active status_burn.",
  "rally_strike": "Basic. Unlock level 1. Target: Default enemy targeting (row-respecting, lowest HP). basic(ATK, targetDEF) damage.",
  "war_hymn": "Active. Unlock level 1. Cooldown: 3 rounds. Target: All living allies (AoE, never row-gated). No damage. Applies status_haste (+3 SPD flat) for 3 rounds to every living ally. (+Choir synergy: also +5% dodge chance to each affected ally for the same duration.)",
  "discordant_verse": "Active. Unlock level 5. Cooldown: 3 rounds. Target: Default enemy targeting (row-respecting, lowest HP). No damage. Applies status_weaken (-30% ATK, 2 rounds) to the target.",
  "encore": "Passive. Unlock level 1. Target: Self, applied at skill-resolution time. Whenever one of this Herald's own equipped active skills is used and its cooldown would be set, reduce that cooldown by 1 (minimum 0) immediately.",
  "battle_hymn": "Passive. Unlock level 8. Target: Self, dynamically rechecked. While this Herald itself currently holds an active status_haste, its own damaging actions (Basic Attack) deal +10% damage."
};

export function skillMechanics(skillId: string): string | undefined {
  const text = MECHANICS[skillId];
  return text ? `${text} ATK/DEF include active modifiers. basic(ATK, targetDEF) = max(1, ATK - floor(targetDEF / 2)). All divisions round down.` : undefined;
}
