import { COPY } from "../copy.js";
import type { Screen } from "../App.js";

const LINKS: Array<{ screen: Screen; label: string }> = [
  { screen: "company", label: COPY.nav_company },
  { screen: "expedition", label: COPY.nav_expedition },
  { screen: "dungeon", label: COPY.nav_dungeon },
  { screen: "inventory", label: COPY.nav_inventory },
  { screen: "boss", label: COPY.nav_boss },
  { screen: "arena", label: COPY.nav_arena },
];

export function NavBar({ current, onNavigate, onLogout, displayName, showDebug }: { current: Screen; onNavigate: (screen: Screen) => void; onLogout: () => void; displayName: string; showDebug?: boolean }) {
  const links = showDebug ? [...LINKS, { screen: "debug" as const, label: "Debug" }] : LINKS;
  return (
    <nav className="nav-bar" aria-label="Main">
      <span className="nav-account">{displayName}</span>
      <ul className="nav-links">
        {links.map((link) => (
          <li key={link.screen}>
            <button type="button" className={link.screen === current ? "nav-link nav-link-active" : "nav-link"} aria-current={link.screen === current ? "page" : undefined} onClick={() => onNavigate(link.screen)}>
              {link.label}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="nav-logout" onClick={onLogout}>
        {COPY.action_confirm_logout}
      </button>
    </nav>
  );
}
