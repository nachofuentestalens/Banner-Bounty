import { useEffect, useRef, useState } from "react";
import { BattleView } from "../components/BattleView.js";
import { SpoilsPanel, type SpoilsData } from "../components/SpoilsPanel.js";
import { NextStep } from "../components/NextStep.js";
import { get, post, mutationPayload } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState, BattleReportView, DungeonSettleResult, EquipmentSlot, Hero, ItemInstance } from "../types.js";
import { COPY, dungeonCopy } from "../copy.js";
import { isActivityActive, isFormationComplete, heroOrdinalLabel } from "../rules.js";
import { DUNGEON_IDS, itemSlot } from "../frozenIds.js";

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

function buildDungeonSpoils(result: DungeonSettleResult, heroesBefore: readonly Hero[], heroesAfter: readonly Hero[]): SpoilsData {
  const wins = result.floorResults.filter((f) => f.result === "win").length;
  const losses = result.floorResults.filter((f) => f.result === "loss").length;
  const items = result.floorResults.flatMap((f) => f.rewards.items);
  const gold = result.floorResults.reduce((sum, f) => sum + f.rewards.gold, 0);
  const xp = result.floorResults.reduce((sum, f) => sum + f.rewards.xp, 0);
  const levelUps = heroesAfter
    .map((after) => {
      const before = heroesBefore.find((h) => h.heroId === after.heroId);
      return before && after.level > before.level ? { heroId: after.heroId, heroLabel: heroOrdinalLabel(heroesAfter, after.heroId), level: after.level } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    wins,
    losses,
    levelUps,
    unlocks: [],
    items,
    gold,
    xp,
    elapsedMs: result.elapsedMs,
    discardedMs: result.discardedMs,
    overflowCount: result.overflow.convertedCount,
    overflowGold: result.overflow.convertedGold,
    ledger: result.floorResults.map((f) => ({ key: String(f.floor), label: f.isBoss ? `Floor ${f.floor} (boss)` : `Floor ${f.floor}`, result: f.result })),
  };
}

export function DungeonScreen({
  state,
  controller,
  onNavigate,
  onOpenInventorySlot,
  onFocusHero,
}: {
  state: AccountState;
  controller: AccountStateController;
  onNavigate: (screen: import("../App.js").Screen) => void;
  onOpenInventorySlot: (slot?: EquipmentSlot) => void;
  onFocusHero: (heroId: string) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const [pending, setPending] = useState<"start" | "settle" | "stop" | null>(null);
  const [latestFloorReportId, setLatestFloorReportId] = useState<string | null>(null);
  const [latestFloorIsBoss, setLatestFloorIsBoss] = useState(false);
  const [dungeonId, setDungeonId] = useState(DUNGEON_IDS[0]!.dungeonId);
  const partyComplete = isFormationComplete(state);
  const activityActive = isActivityActive(state);
  const unlockBoss = DUNGEON_IDS.find((d) => d.dungeonId === dungeonId)?.unlockBossId ?? "";
  const unlocked = state.bossClaims.some((c) => c.bossId === unlockBoss && c.claimedAt !== null);

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
    const heroesBefore = state.heroes;
    await runMutation(async () => {
      let result: DungeonSettleResult;
      if (stop) {
        const { data } = await post<{ finalSettlement: DungeonSettleResult }>("/dungeon/stop", mutationPayload(state.revision, {}));
        result = data.finalSettlement;
      } else {
        const { data } = await post<DungeonSettleResult>("/dungeon/settle", mutationPayload(state.revision, {}));
        result = data;
      }
      const lastFloor = result.floorResults[result.floorResults.length - 1];
      if (lastFloor) {
        setLatestFloorReportId(lastFloor.reportId);
        setLatestFloorIsBoss(lastFloor.isBoss);
      }
      const after = await controller.refetch();
      controller.setSpoils(buildDungeonSpoils(result, heroesBefore, after?.heroes ?? heroesBefore));
    }, controller);
    setPending(null);
  }

  return (
    <main className="screen screen-dungeon">
      <h1 ref={headingRef} tabIndex={-1}>
        Dungeon
      </h1>
      <div className="expedition-columns">
        <section aria-labelledby="dungeon-summary-heading" className="area-summary-card">
          <h2 id="dungeon-summary-heading">{state.dungeon.status === "active" && state.dungeon.dungeonId ? dungeonCopy(state.dungeon.dungeonId).name : dungeonCopy(dungeonId).name}</h2>
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
                  <option key={d.dungeonId} value={d.dungeonId} disabled={!state.bossClaims.some((c) => c.bossId === d.unlockBossId && c.claimedAt !== null)}>
                    {dungeonCopy(d.dungeonId).name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!unlocked && state.dungeon.status === "none" ? <p className="disabled-note">{COPY.dungeon_locked_reason.replace("{boss}", COPY.boss_tollkeeper.name)}</p> : null}
        </section>
        <section aria-labelledby="dungeon-controls-heading" className="expedition-controls-column">
          <h2 id="dungeon-controls-heading">Controls</h2>
          <div className="expedition-controls">
            {state.dungeon.status === "none" ? (
              <>
                <button type="button" className="expedition-primary-action" onClick={start} disabled={pending !== null || !partyComplete || activityActive || !unlocked}>
                  {pending === "start" ? COPY.state_action_pending.label : COPY.action_start_dungeon}
                </button>
                {!partyComplete ? <p className="disabled-note">{COPY.disabled_party_incomplete}</p> : null}
                {activityActive && partyComplete ? <p className="disabled-note">An expedition is already running; only one progression activity may run at a time.</p> : null}
              </>
            ) : (
              <>
                <button type="button" className="expedition-primary-action" onClick={() => settle(false)} disabled={pending !== null}>
                  {pending === "settle" ? COPY.state_action_pending.label : COPY.action_settle_dungeon}
                </button>
                <button type="button" className="expedition-secondary-action" onClick={() => settle(true)} disabled={pending !== null}>
                  {pending === "stop" ? COPY.state_action_pending.label : COPY.action_stop_dungeon}
                </button>
              </>
            )}
          </div>
        </section>
      </div>
      {controller.spoils ? (
        <SpoilsPanel
          spoils={controller.spoils}
          onDismiss={() => controller.setSpoils(null)}
          onOpenItem={(item: ItemInstance) => onOpenInventorySlot(itemSlot(item.definitionId))}
          onFocusHero={onFocusHero}
        />
      ) : null}
      <NextStep state={state} onNavigate={onNavigate} onOpenInventorySlot={(slot) => onOpenInventorySlot(slot)} onFocusHeroBuild={onFocusHero} />
      {latestFloorReportId ? (
        <>
          <h2>Latest floor fight{latestFloorIsBoss ? " (boss)" : ""}</h2>
          <DungeonFloorReport reportId={latestFloorReportId} />
        </>
      ) : null}
    </main>
  );
}
