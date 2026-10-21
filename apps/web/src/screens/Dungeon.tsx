import { useEffect, useRef, useState } from "react";
import { BattleView } from "../components/BattleView.js";
import { get, post, mutationPayload } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState, BattleReportView, DungeonSettleResult } from "../types.js";
import { COPY, dungeonCopy, itemCopy, rarityLabel } from "../copy.js";
import { isActivityActive, isFormationComplete } from "../rules.js";
import { DUNGEON_IDS } from "../frozenIds.js";

/** Dungeon floor reports are retrieved individually via GET /battle-reports/:reportId (contracts.md M2-25: "no new report-retrieval endpoint"). */
function DungeonFloorReport({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<BattleReportView | null>(null);
  useEffect(() => {
    setReport(null);
    get<{ report: BattleReportView }>(`/battle-reports/${encodeURIComponent(reportId)}`)
      .then((envelope) => setReport(envelope.data.report))
      .catch(() => setReport(null));
  }, [reportId]);
  if (!report) return <p role="status">{COPY.state_loading.label}</p>;
  return <BattleView report={report} />;
}

function DungeonSettleResultPanel({ result }: { result: DungeonSettleResult }) {
  return (
    <div className="settlement-result" aria-live="polite">
      <h3>Dungeon progress</h3>
      <p>Elapsed: {Math.round(result.elapsedMs / 1000)}s</p>
      <p>Floors processed this check: {result.creditedFloors}</p>
      <p>Outcome: {result.outcome === "in_progress" ? "Still in progress" : result.outcome === "cleared" ? "Dungeon cleared!" : "Run failed"}</p>
      {result.overflow.convertedCount > 0 ? (
        <p className="inline-note">
          {COPY.inventory_overflow.title}: {result.overflow.convertedCount} drop(s) converted to {result.overflow.convertedGold} gold.
        </p>
      ) : null}
      {result.floorResults.length > 0 ? (
        <table className="combat-log-table">
          <thead>
            <tr>
              <th scope="col">Floor</th>
              <th scope="col">Result</th>
              <th scope="col">Boss</th>
              <th scope="col">XP</th>
              <th scope="col">Gold</th>
              <th scope="col">Items</th>
            </tr>
          </thead>
          <tbody>
            {result.floorResults.map((floor) => (
              <tr key={floor.floor}>
                <td>{floor.floor}</td>
                <td>{floor.result}</td>
                <td>{floor.isBoss ? "Yes" : "No"}</td>
                <td>{floor.rewards.xp}</td>
                <td>{floor.rewards.gold}</td>
                <td>{floor.rewards.items.map((i) => `${itemCopy(i.definitionId).name} (${rarityLabel(i.rarityId)})`).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export function DungeonScreen({ state, controller }: { state: AccountState; controller: AccountStateController }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const [pending, setPending] = useState<"start" | "settle" | "stop" | null>(null);
  const [lastResult, setLastResult] = useState<DungeonSettleResult | null>(null);
  const [dungeonId, setDungeonId] = useState(DUNGEON_IDS[0]!.dungeonId);
  const partyComplete = isFormationComplete(state);
  const activityActive = isActivityActive(state);
  const unlocked = (bossId: string) => state.bossClaims.some((c) => c.bossId === bossId && c.claimedAt !== null);

  async function start() {
    setPending("start");
    await runMutation(async () => {
      await post("/dungeon/start", mutationPayload(state.revision, { dungeonId }));
      await controller.refetch();
    }, controller);
    setPending(null);
  }

  async function settle(stop: boolean) {
    setPending(stop ? "stop" : "settle");
    await runMutation(async () => {
      if (stop) {
        const { data } = await post<{ finalSettlement: DungeonSettleResult }>("/dungeon/stop", mutationPayload(state.revision, {}));
        setLastResult(data.finalSettlement);
      } else {
        const { data } = await post<DungeonSettleResult>("/dungeon/settle", mutationPayload(state.revision, {}));
        setLastResult(data);
      }
      await controller.refetch();
    }, controller);
    setPending(null);
  }

  const latestFloor = lastResult?.floorResults[lastResult.floorResults.length - 1];

  return (
    <main className="screen screen-dungeon">
      <h1 ref={headingRef} tabIndex={-1}>
        Dungeon
      </h1>
      <div className="expedition-columns">
        <section aria-labelledby="dungeon-summary-heading" className="area-summary-card">
          <h2 id="dungeon-summary-heading">
            {state.dungeon.status === "active" && state.dungeon.dungeonId ? dungeonCopy(state.dungeon.dungeonId).name : dungeonCopy(dungeonId).name}
          </h2>
          <p>{dungeonCopy(dungeonId).desc}</p>
          {state.dungeon.status === "active" ? (
            <p>
              Floor {state.dungeon.currentFloor}, {state.dungeon.floorsCleared} cleared so far.
            </p>
          ) : (
            <label htmlFor="dungeon-select">
              Dungeon
              <select id="dungeon-select" value={dungeonId} onChange={(e) => setDungeonId(e.target.value)}>
                {DUNGEON_IDS.map((d) => (
                  <option key={d.dungeonId} value={d.dungeonId} disabled={!unlocked(d.unlockBossId)}>
                    {dungeonCopy(d.dungeonId).name}
                    {!unlocked(d.unlockBossId) ? " (locked)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
        <section aria-labelledby="dungeon-controls-heading" className="expedition-controls-column">
          <h2 id="dungeon-controls-heading">Controls</h2>
          <div className="expedition-controls">
            {state.dungeon.status === "none" ? (
              <>
                <button type="button" onClick={start} disabled={pending !== null || !partyComplete || activityActive || !unlocked(DUNGEON_IDS.find((d) => d.dungeonId === dungeonId)?.unlockBossId ?? "")}>
                  {pending === "start" ? COPY.state_action_pending.label : COPY.action_start_dungeon}
                </button>
                {!partyComplete ? <p className="disabled-note">{COPY.disabled_party_incomplete}</p> : null}
                {activityActive && partyComplete ? <p className="disabled-note">An expedition is already running; only one progression activity may run at a time.</p> : null}
              </>
            ) : (
              <>
                <button type="button" onClick={() => settle(false)} disabled={pending !== null}>
                  {pending === "settle" ? COPY.state_action_pending.label : COPY.action_settle_dungeon}
                </button>
                <button type="button" onClick={() => settle(true)} disabled={pending !== null}>
                  {pending === "stop" ? COPY.state_action_pending.label : COPY.action_stop_dungeon}
                </button>
              </>
            )}
          </div>
          {lastResult ? <DungeonSettleResultPanel result={lastResult} /> : null}
        </section>
      </div>
      {latestFloor ? (
        <>
          <h2>Latest floor fight{latestFloor.isBoss ? " (boss)" : ""}</h2>
          <DungeonFloorReport reportId={latestFloor.reportId} />
        </>
      ) : null}
    </main>
  );
}
