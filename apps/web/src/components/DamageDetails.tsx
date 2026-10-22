import type { BattleEvent, DamageStep } from "../types.js";

const LABELS: Record<string, string> = {
  arcane_reserve: "Arcane Reserve ATK", weaken: "Weakened ATK", fortify: "Fortified DEF",
  shield_bash: "Shield Bash ATK", volley: "Volley ATK (including synergy, if active)", meteor: "Meteor ATK",
  tidal_surge: "Tidal Surge ATK", execute: "Execute bonus", opportunist: "Opportunist",
  overload: "Overload", battle_hymn: "Battle Hymn", brood_surge: "Brood Surge",
  heavy_strike: "Heavy strike", critical: "Critical damage", last_stand: "Last Stand",
};

function describeStep(step: DamageStep): string {
  const [a, b, c] = step.inputs;
  switch (step.kind) {
    case "attack": return `Battle-start ATK ${step.value}`;
    case "defense": return `Battle-start DEF ${step.value}`;
    case "base_damage": return `Base damage: max(1, ${a} ATK − floor(${b} DEF / 2)) = ${step.value}`;
    case "dodge_roll": return `Dodge roll ${a}, chance ${b}%: ${step.value ? "dodged; base damage and critical roll not evaluated" : "hit"}`;
    case "crit_roll": return `Critical roll ${a}, chance ${b}%: ${step.value ? "critical" : "normal"}`;
    case "guaranteed_crit": return "Guaranteed critical: dodge and critical rolls skipped";
    case "burn": return `Burn: ${a} stacks × floor(${b} captured ATK / 3) = ${step.value} (no dodge/critical roll)`;
    case "vital_surge": return `Vital Surge: ${a} damage against ${b} HP → ${step.value} HP lost, survives at 1 HP`;
    default: return LABELS[step.kind]
      ? `${LABELS[step.kind]}: floor(${a} × ${b}/${c}) = ${step.value}`
      : `Recorded modifier: ${step.value}`;
  }
}

/** Formatting only: every operand and result comes from the recorded event. */
export function DamageDetails({ event }: { event: BattleEvent }) {
  const breakdown = event.damageBreakdown;
  if (!breakdown) return event.amount < 0 || event.dodged
    ? <span className="damage-details">Damage breakdown unavailable in this older report.</span> : null;
  return <span className="damage-details">
    {breakdown.steps.map(describeStep).join("; ")}
    {`. Resolved damage ${breakdown.damage}; HP before ${breakdown.hpBefore}; actual HP loss ${breakdown.hpLoss}; HP after ${event.hpAfter}.`}
    {breakdown.damage !== breakdown.hpLoss ? " Damage limited by remaining HP or survival effect." : ""}
  </span>;
}
