import { useRef, useState } from "react";
import { post, mutationPayload } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState } from "../types.js";
import { classCopy } from "../copy.js";

// Developer-only debug panel (not player-facing copy, so plain strings
// rather than copy.ts): lets a tester set a hero's level, grant XP or grant
// gold without grinding. Rendered only when GET /debug/enabled says the
// server has DEBUG_TOOLS=1 set (see App.tsx); every action below still goes
// through the normal mutation envelope and server-side validation, so it
// cannot desync a save or bypass the XP curve.
export function DebugScreen({ state, controller }: { state: AccountState; controller: AccountStateController }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [heroId, setHeroId] = useState(state.heroes[0]?.heroId ?? "");
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(100);
  const [gold, setGold] = useState(500);
  const [pending, setPending] = useState<"level" | "xp" | "gold" | null>(null);

  async function setHeroLevel() {
    if (!heroId) return;
    setPending("level");
    await runMutation(async () => {
      await post("/debug/hero/level", mutationPayload(state.revision, { heroId, level }));
      await controller.refetch();
    }, controller);
    setPending(null);
  }

  async function grantXp() {
    if (!heroId) return;
    setPending("xp");
    await runMutation(async () => {
      await post("/debug/hero/xp", mutationPayload(state.revision, { heroId, xp }));
      await controller.refetch();
    }, controller);
    setPending(null);
  }

  async function grantGold() {
    setPending("gold");
    await runMutation(async () => {
      await post("/debug/gold", mutationPayload(state.revision, { gold }));
      await controller.refetch();
    }, controller);
    setPending(null);
  }

  return (
    <main className="screen screen-debug">
      <h1 ref={headingRef} tabIndex={-1}>
        Debug
      </h1>
      <p className="inline-note">Developer-only testing tools. Not visible in normal play.</p>

      <section aria-labelledby="debug-hero-heading">
        <h2 id="debug-hero-heading">Hero</h2>
        <label htmlFor="debug-hero-select">Hero</label>
        <select id="debug-hero-select" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
          {state.heroes.map((hero) => (
            <option key={hero.heroId} value={hero.heroId}>
              {classCopy(hero.primaryClassId).name} (Lv {hero.level}, {hero.xp} xp)
            </option>
          ))}
        </select>

        <div className="debug-field">
          <label htmlFor="debug-level">Set level (1-10)</label>
          <input id="debug-level" type="number" min={1} max={10} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
          <button type="button" onClick={setHeroLevel} disabled={pending !== null || !heroId}>
            {pending === "level" ? "Setting…" : "Set Level"}
          </button>
        </div>

        <div className="debug-field">
          <label htmlFor="debug-xp">Grant XP</label>
          <input id="debug-xp" type="number" min={1} max={100000} value={xp} onChange={(e) => setXp(Number(e.target.value))} />
          <button type="button" onClick={grantXp} disabled={pending !== null || !heroId}>
            {pending === "xp" ? "Granting…" : "Grant XP"}
          </button>
        </div>
      </section>

      <section aria-labelledby="debug-gold-heading">
        <h2 id="debug-gold-heading">Gold</h2>
        <p>Current gold: {state.gold}</p>
        <div className="debug-field">
          <label htmlFor="debug-gold">Grant gold</label>
          <input id="debug-gold" type="number" min={1} max={1000000} value={gold} onChange={(e) => setGold(Number(e.target.value))} />
          <button type="button" onClick={grantGold} disabled={pending !== null}>
            {pending === "gold" ? "Granting…" : "Grant Gold"}
          </button>
        </div>
      </section>
    </main>
  );
}
