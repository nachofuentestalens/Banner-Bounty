// first-session-redesign.md section 3: a single-row strip shown on every
// authenticated screen. Read-only — it never mutates account state, only
// navigates. The status text changes only when the activity actually
// changes (derived straight from account state, not from the 5s poll tick).
import { COPY } from "../copy.js";
import type { AccountState } from "../types.js";
import type { Screen } from "../App.js";

export function ActivityStrip({ state, onNavigate }: { state: AccountState; onNavigate: (screen: Screen) => void }) {
  let statusText: string;
  let actionLabel: string;
  let actionScreen: Screen;

  if (state.dungeon.status === "active") {
    statusText = COPY.activity_dungeon_running;
    actionLabel = "Open dungeon";
    actionScreen = "dungeon";
  } else if (state.expedition.status === "active") {
    statusText = COPY.activity_expedition_running;
    actionLabel = "Watch / Collect";
    actionScreen = "expedition";
  } else {
    statusText = COPY.activity_idle;
    actionLabel = "Dispatch";
    actionScreen = "expedition";
  }

  return (
    <div className="activity-strip" role="region" aria-label="Activity">
      <p aria-live="polite" className="activity-strip-status">
        {statusText}
      </p>
      <button type="button" className="activity-strip-action" onClick={() => onNavigate(actionScreen)}>
        {actionLabel}
      </button>
    </div>
  );
}
