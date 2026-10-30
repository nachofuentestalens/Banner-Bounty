import { BattleView } from "../components/BattleView.js";
import { SpoilsPanel, type SpoilsData } from "../components/SpoilsPanel.js";
import { NextStep } from "../components/NextStep.js";
import { useEffect, useRef, useState } from "react";
import { post, mutationPayload } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState, EquipmentSlot, Hero, ItemInstance, SettlementResult } from "../types.js";
import { COPY, areaCopy } from "../copy.js";
import { isActivityActive, isFormationComplete, heroOrdinalLabel } from "../rules.js";
import { itemSlot } from "../frozenIds.js";
import type { Screen } from "../App.js";

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
  return <p aria-live="polite">{COPY.expedition_next_fight_estimate.replace("{seconds}", String(remainingSec))}</p>;
}

/** first-session-redesign.md section 7: builds the caller-normalized Spoils view model from a SettlementResult plus a before/after hero snapshot diff (level-ups and secondary-class unlocks aren't in the response itself). */
function buildSpoils(result: SettlementResult, heroesBefore: readonly Hero[], heroesAfter: readonly Hero[]): SpoilsData {
  const levelUps = heroesAfter
    .map((after) => {
      const before = heroesBefore.find((h) => h.heroId === after.heroId);
      return before && after.level > before.level ? { heroId: after.heroId, heroLabel: heroOrdinalLabel(heroesAfter, after.heroId), level: after.level } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const unlocks = heroesAfter
    .map((after) => {
      const before = heroesBefore.find((h) => h.heroId === after.heroId);
      return before && !before.secondaryClassId && after.secondaryClassId ? { heroId: after.heroId, heroLabel: heroOrdinalLabel(heroesAfter, after.heroId), what: "a secondary class" } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    wins: result.outcomes.wins,
    losses: result.outcomes.losses,
    levelUps,
    unlocks,
    items: result.rewards.items,
    gold: result.rewards.gold,
    xp: result.rewards.xp,
    elapsedMs: result.elapsedMs,
    discardedMs: result.discardedMs,
    overflowCount: result.overflow.convertedCount,
    overflowGold: result.overflow.convertedGold,
    ledger: result.recentCycles.map((c) => ({ key: String(c.cycle), label: `Cycle ${c.cycle}`, result: c.result })),
  };
}

function PartySummary({ state }: { state: AccountState }) {
  const slots = state.formation?.slots ?? [null, null, null, null, null];
  const rowOf = (i: number) => (i < 3 ? "Front" : "Back");
  return (
    <ul className="party-summary-list" aria-label="Party summary">
      {slots.map((heroId, i) =>
        heroId ? (
          <li key={i}>
            {rowOf(i)}: {heroOrdinalLabel(state.heroes, heroId)}
          </li>
        ) : (
          <li key={i} className="disabled-note">
            {rowOf(i)}: empty
          </li>
        ),
      )}
    </ul>
  );
}

function AreaSelector({ state, controller }: { state: AccountState; controller: AccountStateController }) {
  const [pending, setPending] = useState(false);
  const locked = isActivityActive(state);

  async function select(areaId: string) {
    setPending(true);
    await runMutation(async () => {
      await post("/area/select", mutationPayload(state.revision, { areaId }));
      await controller.refetch();
    }, controller);
    setPending(false);
  }

  return (
    <ul className="area-select-list" aria-label="Expedition area">
      {state.areas.map((area) => (
        <li key={area.areaId}>
          <button type="button" disabled={pending || locked || !area.unlocked || area.isSelected} onClick={() => select(area.areaId)} aria-pressed={area.isSelected}>
            {areaCopy(area.areaId).name}
            {area.isSelected ? " (selected)" : !area.unlocked ? ` (${COPY.area_locked_reason})` : ""}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ExpeditionScreen({
  state,
  controller,
  onNavigate,
  onOpenInventorySlot,
  onFocusHero,
}: {
  state: AccountState;
  controller: AccountStateController;
  onNavigate: (screen: Screen) => void;
  onOpenInventorySlot: (slot?: EquipmentSlot) => void;
  onFocusHero: (heroId: string) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const [pending, setPending] = useState<"start" | "settle" | "stop" | null>(null);
  const [lastReport, setLastReport] = useState<SettlementResult["latestBattleReport"] | null>(null);
  const partyComplete = isFormationComplete(state);
  const activityActive = isActivityActive(state);
  const selectedArea = areaCopy(state.selectedAreaId);

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
    const heroesBefore = state.heroes;
    await runMutation(async () => {
      let result: SettlementResult;
      if (keepRunning) {
        const { data } = await post<SettlementResult>("/expedition/settle", mutationPayload(state.revision, {}));
        result = data;
      } else {
        const { data } = await post<{ finalSettlement: SettlementResult }>("/expedition/stop", mutationPayload(state.revision, {}));
        result = data.finalSettlement;
      }
      setLastReport(result.latestBattleReport ?? null);
      const after = await controller.refetch();
      controller.setSpoils(buildSpoils(result, heroesBefore, after?.heroes ?? heroesBefore));
    }, controller);
    setPending(null);
  }

  return (
    <main className="screen screen-expedition">
      <h1 ref={headingRef} tabIndex={-1}>
        Expedition
      </h1>
      <section aria-labelledby="expedition-status-heading" className="expedition-status-card">
        <h2 id="expedition-status-heading">{selectedArea.name}</h2>
        {state.expedition.status === "none" ? (
          <>
            <p>{selectedArea.desc}</p>
            <h3>Party</h3>
            <PartySummary state={state} />
            <button type="button" className="expedition-primary-action" onClick={start} disabled={pending !== null || !partyComplete || activityActive}>
              {pending === "start" ? COPY.state_action_pending.label : COPY.action_start_expedition}
            </button>
            {!partyComplete ? <p className="disabled-note">{COPY.disabled_party_incomplete}</p> : null}
            {activityActive && partyComplete ? <p className="disabled-note">A dungeon run is already active; only one progression activity may run at a time.</p> : null}
          </>
        ) : (
          <>
            <p aria-live="polite">Fights credited so far: {state.expedition.cyclesCompletedSinceStart}</p>
            <div className="expedition-controls">
              <button type="button" className="expedition-primary-action" onClick={() => settle(true)} disabled={pending !== null}>
                {pending === "settle" ? COPY.state_action_pending.label : COPY.action_collect}
              </button>
              <button type="button" className="expedition-secondary-action" onClick={() => settle(false)} disabled={pending !== null}>
                {pending === "stop" ? COPY.state_action_pending.label : COPY.action_stop_expedition}
              </button>
            </div>
            <CountdownNote checkpointAt={state.expedition.checkpointAt} />
            <p className="inline-note">
              {COPY.expedition_loadout_locked.title}: {COPY.expedition_loadout_locked.body}
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="expedition-fight-heading">
        <h2 id="expedition-fight-heading">{lastReport ? "Latest expedition fight" : COPY.fight_replay_heading}</h2>
        {lastReport ? <BattleView report={lastReport} /> : <p>{COPY.fight_none_yet}</p>}
      </section>

      {controller.spoils ? (
        <SpoilsPanel
          spoils={controller.spoils}
          onDismiss={() => controller.setSpoils(null)}
          onOpenItem={(item: ItemInstance) => onOpenInventorySlot(itemSlot(item.definitionId))}
          onFocusHero={onFocusHero}
        />
      ) : null}

      <NextStep
        state={state}
        onNavigate={onNavigate}
        onOpenInventorySlot={(slot) => onOpenInventorySlot(slot)}
        onFocusHeroBuild={onFocusHero}
      />

      <section aria-labelledby="expedition-areas-heading" className="expedition-areas-card">
        <h3 id="expedition-areas-heading">Areas</h3>
        <AreaSelector state={state} controller={controller} />
        {activityActive ? <p className="disabled-note">Area choice is locked while an expedition or dungeon run is active.</p> : null}
      </section>
    </main>
  );
}
