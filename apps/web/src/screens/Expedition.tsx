import { useEffect, useRef, useState } from "react";
import { post, mutationPayload } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState, SettlementResult } from "../types.js";
import { COPY, composeItemName } from "../copy.js";
import { isPartyComplete } from "../rules.js";

const CYCLE_MS = 60_000;

function CountdownNote({ checkpointAt }: { checkpointAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const checkpointMs = new Date(checkpointAt).getTime();
  const sinceMs = Math.max(0, now - checkpointMs);
  const remainingMs = Math.max(0, CYCLE_MS - (sinceMs % CYCLE_MS));
  const remainingSec = Math.ceil(remainingMs / 1000);
  return (
    <p aria-live="polite">
      Estimated next cycle in ~{remainingSec}s (display estimate only; the server settles the real result).
    </p>
  );
}

function SettlementResultPanel({ result }: { result: SettlementResult }) {
  return (
    <div className="settlement-result" aria-live="polite">
      <h3>Settlement result</h3>
      <p>Elapsed: {Math.round(result.elapsedMs / 1000)}s</p>
      <p>Credited cycles: {result.creditedCycles}</p>
      {result.discardedMs > 0 ? (
        <p className="inline-note">
          {COPY.expedition_offline_cap.title}: {COPY.expedition_offline_cap.body} ({Math.round(result.discardedMs / 1000)}s discarded)
        </p>
      ) : null}
      <p>
        Rewards: {result.rewards.xp} XP, {result.rewards.gold} gold, {result.rewards.items.length} item(s)
      </p>
      <p>
        Outcomes: {result.outcomes.wins} win(s), {result.outcomes.losses} loss(es)
      </p>
      {result.overflow.convertedCount > 0 ? (
        <p className="inline-note">
          {COPY.inventory_overflow.title}: {result.overflow.convertedCount} drop(s) converted to {result.overflow.convertedGold} gold.
        </p>
      ) : null}
      {result.recentCycles.length > 0 ? (
        <div role="region" aria-label="Recent cycle log" tabIndex={0} className="combat-log-scroll">
          <table className="combat-log-table">
            <thead>
              <tr>
                <th scope="col">Cycle</th>
                <th scope="col">Result</th>
                <th scope="col">Rounds</th>
                <th scope="col">Gold</th>
                <th scope="col">Drop</th>
              </tr>
            </thead>
            <tbody>
              {result.recentCycles.map((cycle) => (
                <tr key={cycle.cycle}>
                  <td>{cycle.cycle}</td>
                  <td>{cycle.result}</td>
                  <td>{cycle.rounds}</td>
                  <td>{cycle.gold}</td>
                  <td>{cycle.drop ? `${composeItemName(cycle.drop.definitionId, cycle.drop.affixId)}${cycle.converted ? " (converted to gold)" : ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function ExpeditionScreen({ state, controller }: { state: AccountState; controller: AccountStateController }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const [pending, setPending] = useState<"start" | "settle" | "stop" | null>(null);
  const [lastResult, setLastResult] = useState<SettlementResult | null>(null);
  const partyComplete = isPartyComplete(state);

  async function start() {
    setPending("start");
    await runMutation(async () => {
      await post("/expedition/start", mutationPayload(state.revision, {}));
      await controller.refetch();
    }, controller);
    setPending(null);
  }

  async function settle(keepRunning: boolean) {
    setPending(keepRunning ? "settle" : "stop");
    await runMutation(async () => {
      if (keepRunning) {
        const { data } = await post<SettlementResult>("/expedition/settle", mutationPayload(state.revision, {}));
        setLastResult(data);
      } else {
        const { data } = await post<{ finalSettlement: SettlementResult }>("/expedition/stop", mutationPayload(state.revision, {}));
        setLastResult(data.finalSettlement);
      }
      await controller.refetch();
    }, controller);
    setPending(null);
  }

  return (
    <main className="screen screen-expedition">
      <h1 ref={headingRef} tabIndex={-1}>
        Expedition
      </h1>
      <div className="expedition-columns">
        <section aria-labelledby="area-summary-heading" className="area-summary-card">
          <h2 id="area-summary-heading">{COPY.area_old_road.name}</h2>
          <p>{COPY.area_old_road.desc}</p>
          <ul>
            <li>{COPY.enemy_road_brigand.name}</li>
            <li>{COPY.enemy_road_wolf.name}</li>
            <li>{COPY.enemy_road_cutpurse.name}</li>
          </ul>
          {state.expedition.status === "active" ? <CountdownNote checkpointAt={state.expedition.checkpointAt} /> : null}
        </section>
        <section aria-labelledby="expedition-controls-heading" className="expedition-controls-column">
          <h2 id="expedition-controls-heading">Controls</h2>
          {state.expedition.status === "active" ? (
            <p className="inline-note">
              {COPY.expedition_loadout_locked.title}: {COPY.expedition_loadout_locked.body}
            </p>
          ) : null}
          <div className="expedition-controls">
            {state.expedition.status === "none" ? (
              <>
                <button type="button" onClick={start} disabled={pending !== null || !partyComplete}>
                  {pending === "start" ? COPY.state_action_pending.label : COPY.action_start_expedition}
                </button>
                {!partyComplete ? <p className="disabled-note">{COPY.disabled_party_incomplete}</p> : null}
              </>
            ) : (
              <>
                <button type="button" onClick={() => settle(true)} disabled={pending !== null}>
                  {pending === "settle" ? COPY.state_action_pending.label : COPY.action_collect}
                </button>
                <button type="button" onClick={() => settle(false)} disabled={pending !== null}>
                  {pending === "stop" ? COPY.state_action_pending.label : COPY.action_stop_expedition}
                </button>
              </>
            )}
          </div>
          {lastResult ? <SettlementResultPanel result={lastResult} /> : null}
        </section>
      </div>
    </main>
  );
}
