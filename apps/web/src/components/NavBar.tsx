import { COPY } from "../copy.js";
import type { Screen } from "../App.js";
import type { AccountState } from "../types.js";

const LINKS: Array<{ screen: Screen; label: string }> = [
  { screen: "company", label: COPY.nav_company },
  { screen: "expedition", label: COPY.nav_expedition },
  { screen: "dungeon", label: COPY.nav_dungeon },
  { screen: "inventory", label: COPY.nav_inventory },
  { screen: "boss", label: COPY.nav_boss },
  { screen: "arena", label: COPY.nav_arena },
  { screen: "codex", label: COPY.nav_codex },
];

/** first-session-redesign.md section 3: a locked destination stays reachable, with a text suffix (never colour alone) and a full accessible name. Only Dungeon has a documented lock condition in M1/M2 (the Tollkeeper gate). */
function lockReason(screen: Screen, state: AccountState | null): string | null {
  if (screen !== "dungeon" || !state) return null;
  const claimed = state.bossClaims.some((c) => c.bossId === "boss_tollkeeper" && c.claimedAt != null);
  return claimed ? null : COPY.boss_tollkeeper.name;
}

export function NavBar({ current, onNavigate, onLogout, displayName, showDebug, state }: { current: Screen; onNavigate: (screen: Screen) => void; onLogout: () => void; displayName: string; showDebug?: boolean; state: AccountState | null }) {
  const links = showDebug ? [...LINKS, { screen: "debug" as const, label: "Debug" }] : LINKS;
  return (
    <nav className="nav-bar" aria-label="Main">
      <span className="nav-account">{displayName}</span>
      <ul className="nav-links">
        {links.map((link) => {
          const reason = lockReason(link.screen, state);
          const accessibleName = reason ? `${link.label}, ${COPY.nav_locked_suffix}: defeat ${reason}` : link.label;
          return (
            <li key={link.screen}>
              <button
                type="button"
                className={link.screen === current ? "nav-link nav-link-active" : "nav-link"}
                aria-current={link.screen === current ? "page" : undefined}
                aria-label={reason ? accessibleName : undefined}
                onClick={() => onNavigate(link.screen)}
              >
                {link.label}
                {reason ? <span className="nav-lock-suffix" aria-hidden="true"> ({COPY.nav_locked_suffix})</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="nav-logout" onClick={onLogout}>
        {COPY.action_confirm_logout}
      </button>
    </nav>
  );
}
