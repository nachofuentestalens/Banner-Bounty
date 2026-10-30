// first-session-redesign.md section 7. A caller-normalized view model so
// this one component renders both expedition settlements and dungeon
// settlements identically. The caller (Expedition.tsx / Dungeon.tsx) is
// responsible for building this from the server's response plus a
// before/after hero-level diff; this component only presents it.
import type { ItemInstance } from "../types.js";
import { COPY, composeItemName, rarityLabel } from "../copy.js";

export interface SpoilsLevelUp {
  heroId: string;
  heroLabel: string;
  level: number;
}

export interface SpoilsUnlock {
  heroId: string;
  heroLabel: string;
  what: string;
}

export interface SpoilsLedgerRow {
  key: string;
  label: string;
  result: "win" | "loss" | "draw";
  extra?: string;
}

export interface SpoilsData {
  wins: number;
  losses: number;
  levelUps: SpoilsLevelUp[];
  unlocks: SpoilsUnlock[];
  items: ItemInstance[];
  gold: number;
  xp: number;
  elapsedMs: number;
  discardedMs: number;
  overflowCount: number;
  overflowGold: number;
  ledger: SpoilsLedgerRow[];
}

export function SpoilsPanel({ spoils, onDismiss, onOpenItem, onFocusHero }: { spoils: SpoilsData; onDismiss: () => void; onOpenItem: (item: ItemInstance) => void; onFocusHero: (heroId: string) => void }) {
  const zeroCycles = spoils.wins === 0 && spoils.losses === 0 && spoils.ledger.length === 0;

  return (
    <section className="spoils-panel" aria-labelledby="spoils-heading" aria-live="polite">
      <div className="spoils-header">
        <h2 id="spoils-heading">{zeroCycles ? COPY.spoils_nothing_yet : COPY.spoils_headline.replace("{wins}", String(spoils.wins)).replace("{losses}", String(spoils.losses))}</h2>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {zeroCycles ? null : (
        <>
          {spoils.levelUps.length > 0 || spoils.unlocks.length > 0 ? (
            <ul className="spoils-progress-list">
              {spoils.levelUps.map((l) => (
                <li key={`lvl-${l.heroId}`}>
                  <button type="button" onClick={() => onFocusHero(l.heroId)}>
                    {COPY.spoils_level_up.replace("{hero}", l.heroLabel).replace("{level}", String(l.level))}
                  </button>
                </li>
              ))}
              {spoils.unlocks.map((u, i) => (
                <li key={`unlock-${u.heroId}-${i}`}>
                  <button type="button" onClick={() => onFocusHero(u.heroId)}>
                    {COPY.spoils_unlock.replace("{hero}", u.heroLabel).replace("{what}", u.what)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {spoils.items.length > 0 ? (
            <ul className="spoils-item-list">
              {spoils.items.map((item) => (
                <li key={item.itemInstanceId}>
                  {composeItemName(item.definitionId, item.affixes)} ({rarityLabel(item.rarityId)})
                  <button type="button" onClick={() => onOpenItem(item)}>
                    Compare and equip
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="spoils-totals">
            {spoils.gold} gold, {spoils.xp} XP
          </p>

          <p className="spoils-time-line">
            Elapsed {Math.round(spoils.elapsedMs / 1000)}s, credited {Math.round((spoils.elapsedMs - spoils.discardedMs) / 1000)}s
            {spoils.discardedMs > 0 ? ` — ${COPY.spoils_cap_applied}` : ""}
          </p>

          {spoils.overflowCount > 0 ? (
            <p className="inline-note">
              {COPY.inventory_overflow.title}: {spoils.overflowCount} drop(s) converted to {spoils.overflowGold} gold.
            </p>
          ) : null}

          {spoils.ledger.length > 0 ? (
            <details className="spoils-ledger">
              <summary>Fight-by-fight ledger</summary>
              <div role="region" aria-label="Fight-by-fight ledger" tabIndex={0} className="combat-log-scroll">
                <ul>
                  {spoils.ledger.map((row) => (
                    <li key={row.key}>
                      {row.label}: {row.result === "win" ? "Victory" : row.result === "loss" ? "Defeated" : "Draw"}
                      {row.extra ? ` — ${row.extra}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
