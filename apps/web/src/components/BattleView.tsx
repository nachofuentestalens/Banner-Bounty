// The M2 full battle view (design/studio/milestones/M2.md scope item 1):
// every unit on both sides (name, class, numeric HP bar, status effects with
// duration) plus a turn-by-turn action feed and pause/step/speed/skip
// playback controls. Used uniformly for expeditions, dungeon floors/bosses,
// standalone bosses and arena replays — the caller only supplies the
// already-fetched BattleReportView.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BattleEvent, BattleReportView, BattleUnit } from "../types.js";
import { classCopy, skillCopy, statusCopy } from "../copy.js";
import { SkillLabel } from "./SkillLabel.js";
import { DamageDetails } from "./DamageDetails.js";

const OUTCOME_LABEL = { win: "Victory", loss: "Defeated", draw: "Draw" } as const;

/** Prettifies a raw event `type` (enemy/boss action ids, synthetic tick/expire types) with no copy entry of its own. */
function prettyType(type: string): string {
  return type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function readUnits(snapshot: unknown): BattleUnit[] {
  if (!snapshot || typeof snapshot !== "object" || !("units" in snapshot) || !Array.isArray((snapshot as { units: unknown }).units)) {
    return [];
  }
  return (snapshot as { units: unknown[] }).units.filter(
    (u): u is BattleUnit =>
      !!u &&
      typeof u === "object" &&
      typeof (u as BattleUnit).unitId === "string" &&
      typeof (u as BattleUnit).name === "string" &&
      ((u as BattleUnit).side === "A" || (u as BattleUnit).side === "B") &&
      Number.isFinite((u as BattleUnit).maxHp),
  );
}

function classLabel(unit: BattleUnit): string {
  if (unit.kind !== "hero" || !unit.classId) return "";
  const primary = classCopy(unit.classId).name;
  return unit.secondaryClassId ? `${primary} / ${classCopy(unit.secondaryClassId).name}` : primary;
}

interface LiveStatus {
  statusId: string;
  duration: number;
  appliedRound: number;
  stacks?: number;
}

interface ReplayState {
  hp: Record<string, number>;
  statuses: Record<string, LiveStatus[]>;
  lastEvent: BattleEvent | null;
  currentRound: number;
}

/** Replays events[0..cursor) to derive the exact HP/status state at that point — the single source of truth every control (pause/step/speed/skip) reads from, so none of them can desync from the shown state. */
function replay(units: BattleUnit[], events: readonly BattleEvent[], cursor: number): ReplayState {
  const hp: Record<string, number> = {};
  for (const u of units) hp[u.unitId] = u.maxHp;
  const statuses: Record<string, LiveStatus[]> = {};
  for (const u of units) statuses[u.unitId] = [];
  let lastEvent: BattleEvent | null = null;
  let currentRound = 1;

  for (let i = 0; i < cursor && i < events.length; i++) {
    const e = events[i]!;
    lastEvent = e;
    currentRound = e.round;
    if (e.targetId && e.hpAfter !== null) hp[e.targetId] = e.hpAfter;
    if (e.targetId && e.statusApplied) {
      const list = statuses[e.targetId] ?? (statuses[e.targetId] = []);
      const idx = list.findIndex((s) => s.statusId === e.statusApplied!.statusId);
      const entry: LiveStatus = { statusId: e.statusApplied.statusId, duration: e.statusApplied.duration, appliedRound: e.round, stacks: e.statusApplied.stacks };
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
    }
    if (e.targetId && e.statusExpired) {
      statuses[e.targetId] = (statuses[e.targetId] ?? []).filter((s) => s.statusId !== e.statusExpired);
    }
  }
  return { hp, statuses, lastEvent, currentRound };
}

function unitName(units: readonly BattleUnit[], unitId: string | null): string {
  if (!unitId) return "";
  return units.find((u) => u.unitId === unitId)?.name ?? unitId;
}

/** One readable turn-feed line per event, composed from actor/skill/target/amount/crit/dodge/status/death. */
function describeEvent(e: BattleEvent, units: readonly BattleUnit[]): string {
  const actor = unitName(units, e.sourceId);
  const target = unitName(units, e.targetId);
  const skillName = e.skillId ? skillCopy(e.skillId).name : prettyType(e.type);

  if (e.dodged) return `${actor} attacks ${target} with ${skillName} — dodged!`;

  const parts: string[] = [];
  if (!e.sourceId) {
    // Null-source events: status ticks (burn/regen) or an expiry notice.
    if (e.statusExpired) parts.push(`${target}'s ${statusCopy(e.statusExpired).name.toLowerCase()} status fades.`);
    else if (e.amount < 0) parts.push(`${target} takes ${Math.abs(e.amount)} damage from ${prettyType(e.type)}.`);
    else if (e.amount > 0) parts.push(`${target} recovers ${e.amount} HP from ${prettyType(e.type)}.`);
    else parts.push(`${target}: ${prettyType(e.type)}.`);
  } else if (e.amount < 0) {
    parts.push(`${actor} uses ${skillName} on ${target} for ${Math.abs(e.amount)} damage${e.crit ? " — a solid hit!" : ""}.`);
  } else if (e.amount > 0) {
    parts.push(`${actor} uses ${skillName} on ${target}, healing ${e.amount} HP.`);
  } else {
    parts.push(`${actor} uses ${skillName} on ${target}.`);
  }
  if (e.statusApplied) parts.push(`(${statusCopy(e.statusApplied.statusId).name} applied, ${e.statusApplied.duration} round(s))`);
  if (e.death) parts.push(`${target} falls.`);
  return parts.join(" ");
}

function EventDescription({ event, units }: { event: BattleEvent; units: readonly BattleUnit[] }) {
  const description = describeEvent(event, units);
  const name = event.skillId ? skillCopy(event.skillId).name : "";
  const index = name ? description.indexOf(name) : -1;
  if (index < 0 || !event.skillId) return <>{description}<DamageDetails event={event} /></>;
  return <>{description.slice(0, index)}<SkillLabel skillId={event.skillId} />{description.slice(index + name.length)}<DamageDetails event={event} /></>;
}

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  return (
    <div>
      <div className="hp-track" role="progressbar" aria-valuemin={0} aria-valuemax={maxHp} aria-valuenow={hp}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="hp-label">
        {hp} / {maxHp} HP
      </span>
    </div>
  );
}

function UnitPanel({ unit, hp, statuses, acting, targeted }: { unit: BattleUnit; hp: number; statuses: LiveStatus[]; acting: boolean; targeted: boolean }) {
  const fallen = hp <= 0;
  return (
    <article
      className={`combatant ${fallen ? "fallen" : ""} ${acting ? "acting" : ""} ${targeted ? "targeted" : ""}`}
      aria-label={`${unit.side === "A" ? "Company" : "Opponent"} ${unit.name}`}
    >
      <div className="unit-info">
        <strong>{unit.name}</strong>
        {classLabel(unit) ? <span className="unit-class"> ({classLabel(unit)})</span> : null}
        <span className="unit-state">{fallen ? "Defeated" : acting ? "Acting" : targeted ? "Targeted" : "Ready"}</span>
        <HpBar hp={Math.max(0, hp)} maxHp={unit.maxHp} />
        {statuses.length > 0 ? (
          <ul className="status-badges" aria-label={`${unit.name} status effects`}>
            {statuses.map((s) => (
              <li key={s.statusId} className="status-badge">
                {statusCopy(s.statusId).name}
                {s.stacks && s.stacks > 1 ? ` x${s.stacks}` : ""} ({Math.max(0, s.duration - 1)}r)
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

export function BattleView({ report, extra }: { report: BattleReportView; extra?: ReactNode }) {
  const units = useMemo(() => readUnits(report.participantsSnapshot), [report.participantsSnapshot]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const [speed, setSpeed] = useState(1);

  // A new report (new reportId) resets playback to the start.
  useEffect(() => {
    setCursor(0);
    setPlaying(() => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    setSpeed(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.reportId]);

  const finished = cursor >= report.events.length;
  useEffect(() => {
    if (!playing || finished || units.length === 0) return;
    const timer = setTimeout(() => setCursor((c) => c + 1), 950 / speed);
    return () => clearTimeout(timer);
  }, [cursor, playing, speed, finished, units.length]);

  const state = useMemo(() => replay(units, report.events, cursor), [units, report.events, cursor]);
  const event = cursor > 0 ? report.events[cursor - 1] ?? null : null;
  const hpFinal = finished ? report.result.finalHp : state.hp;

  const sideA = units.filter((u) => u.side === "A").sort((a, b) => a.slotIndex - b.slotIndex);
  const sideB = units.filter((u) => u.side === "B").sort((a, b) => a.slotIndex - b.slotIndex);
  const frontRow = (list: BattleUnit[]) => list.filter((u) => u.slotIndex <= 2);
  const backRow = (list: BattleUnit[]) => list.filter((u) => u.slotIndex > 2);

  return (
    <section className="battle-result-panel" aria-label="Battle replay">
      <div className="battle-heading">
        <div>
          <p className="battle-eyebrow">
            {report.kind === "boss" || report.kind === "dungeon_boss" ? "Boss encounter" : report.kind === "arena" ? "Arena encounter" : report.kind === "dungeon_floor" ? "Dungeon floor" : "Expedition"}
          </p>
          <h3>{finished || units.length === 0 ? OUTCOME_LABEL[report.result.outcome] : "Battle in progress"}</h3>
        </div>
        <span className="round-badge">
          Round {event?.round ?? 1} / {report.result.rounds}
        </span>
      </div>
      <p className="battle-note">Recorded fight / playback does not spend resources or grant rewards again.</p>
      {units.length > 0 ? (
        <>
          <div className="battlefield">
            {([["A", sideA], ["B", sideB]] as const).map(([team, list]) => (
              <div className={`battle-team team-${team}`} key={team}>
                <h4>{team === "A" ? "Your company" : "Opposition"}</h4>
                {([["front", frontRow(list)], ["back", backRow(list)]] as const).map(([rowName, rowUnits]) =>
                  rowUnits.length > 0 ? (
                    <div className={`battle-row row-${rowName}`} key={rowName} aria-label={`${team === "A" ? "Company" : "Opponent"} ${rowName} row`}>
                      <span className="row-label">{rowName === "front" ? "Front row" : "Back row"}</span>
                      {rowUnits.map((unit) => (
                        <UnitPanel
                          key={unit.unitId}
                          unit={unit}
                          hp={hpFinal[unit.unitId] ?? unit.maxHp}
                          statuses={state.statuses[unit.unitId] ?? []}
                          acting={!finished && event?.sourceId === unit.unitId}
                          targeted={!finished && event?.targetId === unit.unitId}
                        />
                      ))}
                    </div>
                  ) : null,
                )}
              </div>
            ))}
          </div>
          <p className="battle-action" role="status">
            {event ? <EventDescription event={event} units={units} /> : "Both teams are ready. Watch each action unfold."}
            {finished ? ` / ${OUTCOME_LABEL[report.result.outcome]}` : ""}
          </p>
          <div className="battle-controls">
            <button type="button" disabled={finished} onClick={() => setPlaying((p) => !p)}>
              {playing && !finished ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              disabled={finished}
              onClick={() => {
                setPlaying(false);
                setCursor((c) => c + 1);
              }}
            >
              Step
            </button>
            <button
              type="button"
              onClick={() => {
                setCursor(0);
                setPlaying(false);
              }}
            >
              Restart replay
            </button>
            <button
              type="button"
              disabled={finished}
              onClick={() => {
                setCursor(report.events.length);
                setPlaying(false);
              }}
            >
              Skip to end
            </button>
            <label>
              Speed
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </label>
            <span>
              {cursor} / {report.events.length} actions
            </span>
          </div>
        </>
      ) : (
        <p>This older report has no unit snapshots. Its full event log is available below.</p>
      )}
      {(finished || units.length === 0) && extra}
      <details>
        <summary>Full combat log ({report.events.length} events)</summary>
        <div className="combat-log-scroll" role="region" aria-label="Battle event log" tabIndex={0}>
          <ol className="battle-log">
            {report.events.map((e, i) => (
              <li key={i}>
                Round {e.round} / <EventDescription event={e} units={units} />
                {e.hpAfter !== null ? ` / ${e.hpAfter} HP remaining` : ""}
              </li>
            ))}
          </ol>
        </div>
      </details>
    </section>
  );
}
