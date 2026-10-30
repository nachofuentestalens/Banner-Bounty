// first-session-redesign.md section 4.2: one card, always first, driven
// purely by rules.ts's nextGoal (a pure, tested function over account
// state). Rendering this never sends a request.
import { COPY } from "../copy.js";
import type { AccountState, EquipmentSlot } from "../types.js";
import type { Screen } from "../App.js";
import { nextGoal, type GoalId } from "../rules.js";

const GOAL_COPY: Record<GoalId, { title: string; why: string }> = {
  dispatch: COPY.next_dispatch,
  watch_or_collect: COPY.next_watch_or_collect,
  equip: COPY.next_equip,
  secondary_class: COPY.next_secondary_class,
  challenge_boss: COPY.next_challenge_boss,
  enter_dungeon: COPY.next_enter_dungeon,
  publish_arena: COPY.next_publish_arena,
  keep_building: COPY.next_keep_building,
};

export function NextStep({
  state,
  onNavigate,
  onOpenInventorySlot,
  onFocusHeroBuild,
}: {
  state: AccountState;
  onNavigate: (screen: Screen) => void;
  onOpenInventorySlot: (slot: EquipmentSlot) => void;
  onFocusHeroBuild: (heroId: string) => void;
}) {
  const goal = nextGoal(state);
  const copy = GOAL_COPY[goal.id];

  function act() {
    switch (goal.id) {
      case "dispatch":
        onNavigate("expedition");
        return;
      case "watch_or_collect":
        onNavigate("expedition");
        return;
      case "equip":
        if (goal.slot) onOpenInventorySlot(goal.slot);
        return;
      case "secondary_class":
        if (goal.heroId) onFocusHeroBuild(goal.heroId);
        return;
      case "challenge_boss":
        onNavigate("boss");
        return;
      case "enter_dungeon":
        onNavigate("dungeon");
        return;
      case "publish_arena":
        onNavigate("arena");
        return;
      case "keep_building":
        return;
    }
  }

  return (
    <section className="next-step-card" aria-labelledby="next-step-heading">
      <h2 id="next-step-heading">{copy.title}</h2>
      <p className="next-step-why">{copy.why}</p>
      {goal.id !== "keep_building" ? (
        <button type="button" className="next-step-action" onClick={act}>
          {copy.title}
        </button>
      ) : null}
    </section>
  );
}
