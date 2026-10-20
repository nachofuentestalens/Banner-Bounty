import { useEffect, useState, type ReactNode } from "react";
import type { BattleEvent, BattleReportView } from "../types.js";
import { COPY } from "../copy.js";

interface Unit { id: string; team: "A" | "B"; role: string; maxHp: number }
const outcomes = { win: "Victory", loss: "Defeated", draw: "Draw" };
function label(value: string) {
  const copy = (COPY as Record<string, unknown>)[value];
  if (copy && typeof copy === "object" && "name" in copy) return String(copy.name);
  return value.replace(/_guard_redirect$/, " (guard interception)").replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
}
function readUnits(snapshot: unknown): Unit[] {
  if (!snapshot || typeof snapshot !== "object" || !("units" in snapshot) || !Array.isArray(snapshot.units)) return [];
  return snapshot.units.filter((u): u is Unit => u && typeof u.id === "string" && typeof u.role === "string" && (u.team === "A" || u.team === "B") && Number.isFinite(u.maxHp) && u.maxHp > 0);
}

/** Original vector silhouettes; health and actions always come from the recorded server battle. */
function Fighter({ role }: { role: string }) {
  const mage = role.includes("arcanist");
  const ranger = role.includes("ranger") || role.includes("cutpurse");
  const wolf = role.includes("wolf");
  return <svg viewBox="0 0 100 100" aria-hidden="true" className="fighter-art">
    <ellipse cx="50" cy="91" rx="33" ry="5" fill="black" opacity=".3" />
    {wolf ? <><path d="M15 65 25 45 47 51 69 34 82 37 91 51 74 58 64 77 57 89 49 89 52 72 32 72 26 89 18 89 23 66Z" fill="currentColor"/><path d="m69 36 1-18 10 20" fill="currentColor"/><circle cx="79" cy="43" r="2" fill="#171d24"/></> : <>
      <path d="M35 45 23 86 77 86 65 45Z" fill="currentColor" opacity=".35"/>
      <path d="m39 64-4 25h11l4-22 5 22h11l-6-25" fill="currentColor"/>
      <path d="M34 41 63 41 68 67 31 67Z" fill="currentColor"/>
      <circle cx="49" cy="28" r="13" fill="#e8cfab"/>
      <path d={mage ? "M30 23 48 2 66 23Z" : ranger ? "M34 29Q31 6 50 11Q68 15 64 33L54 22Z" : "M35 29V17Q50 5 64 17V30L55 25V19H43V27Z"} fill="currentColor"/>
      {mage ? <><path d="M77 89V23" stroke="#c5a368" strokeWidth="5"/><path d="m77 8 8 12-8 12-8-12Z" fill="#b8e9ff"/></> : ranger ? <><path d="M77 27Q103 53 77 80Z" fill="none" stroke="#d7bd81" strokeWidth="3"/><path d="M63 51H94" stroke="#fff0cc" strokeWidth="2"/></> : <><path d="m77 54 4-40 5 40-5 6Z" fill="#e5e9ed"/><path d="M72 59H90M81 59V74" stroke="#d8b575" strokeWidth="4"/><path d="M18 47 39 43 42 64 29 76 16 64Z" fill="#293a49" stroke="currentColor" strokeWidth="3"/></>}
    </>}
  </svg>;
}

function Playback({ report, extra }: { report: BattleReportView; extra?: ReactNode }) {
  const units = readUnits(report.participantsSnapshot);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const [speed, setSpeed] = useState(1);
  const finished = cursor >= report.events.length;
  const event = report.events[cursor - 1];
  useEffect(() => {
    if (!playing || finished || !units.length) return;
    const timer = setTimeout(() => setCursor(c => c + 1), 950 / speed);
    return () => clearTimeout(timer);
  }, [cursor, playing, speed, finished, units.length]);
  const hp = Object.fromEntries(units.map(u => [u.id, u.maxHp]));
  const lastAction: Record<string, string> = {};
  for (const e of report.events.slice(0, cursor)) {
    if (e.targetId && e.hpAfter !== null) hp[e.targetId] = e.hpAfter;
    if (e.sourceId) lastAction[e.sourceId] = label(e.type);
  }
  if (finished) Object.assign(hp, report.result.finalHp);
  const name = (id: string | null) => id ? label(units.find(u => u.id === id)?.role ?? id) : "Burn";
  const describe = (e: BattleEvent) => e.sourceId
    ? `${name(e.sourceId)} uses ${label(e.type)} on ${name(e.targetId)} (${e.amount > 0 ? "+" : ""}${e.amount} HP)`
    : `${name(e.targetId)} takes ${label(e.type)} (${e.amount} HP)`;
  return <section className="battle-result-panel" aria-label="Battle replay">
    <div className="battle-heading"><div><p className="battle-eyebrow">{report.kind === "boss" ? "Boss encounter" : report.kind === "arena" ? "Arena encounter" : "The Old Road"}</p><h3>{finished || !units.length ? outcomes[report.result.outcome] : "Battle in progress"}</h3></div><span className="round-badge">Round {event?.round ?? 1} / {report.result.rounds}</span></div>
    <p className="battle-note">Recorded fight / playback does not spend resources or grant rewards again.</p>
    {units.length ? <>
      <div className="battlefield">
        {(["A", "B"] as const).map(team => <div className={`battle-team team-${team}`} key={team}><h4>{team === "A" ? "Your company" : "Opposition"}</h4>
          {units.filter(u => u.team === team).map((unit, index) => {
            const health = hp[unit.id] ?? unit.maxHp;
            const acting = !finished && event?.sourceId === unit.id;
            const targeted = event?.targetId === unit.id;
            return <article key={unit.id} className={`combatant ${health === 0 ? "fallen" : ""} ${acting ? "acting" : ""} ${targeted ? "targeted" : ""}`} aria-label={`${team === "A" ? "Company" : "Opponent"} ${label(unit.role)} ${index + 1}`}>
              <div className="fighter-stage"><Fighter role={unit.role}/>{targeted && event ? <span key={cursor} className={`damage-number ${event.amount > 0 ? "healing" : ""}`}>{event.amount > 0 ? "+" : ""}{event.amount}</span> : null}</div>
              <div className="unit-info"><strong>{label(unit.role)}</strong><span className="unit-state">{health === 0 ? "Defeated" : acting ? `Acting / ${label(event!.type)}` : targeted ? event!.amount > 0 ? "Healed" : "Hit" : lastAction[unit.id] ? `Last: ${lastAction[unit.id]}` : "Ready"}</span>
              <div className="hp-track" role="progressbar" aria-label={`${team === "A" ? "Company" : "Opponent"} ${label(unit.role)} HP`} aria-valuemin={0} aria-valuemax={unit.maxHp} aria-valuenow={health}><div style={{ width: `${Math.max(0, Math.min(100, health / unit.maxHp * 100))}%` }}/></div><span className="hp-label">{health} / {unit.maxHp} HP</span></div>
            </article>;
          })}
        </div>)}
      </div>
      <p className="battle-action" role="status">{event ? describe(event) : "Both teams are ready. Watch each action unfold."}{finished ? ` / ${outcomes[report.result.outcome]}` : ""}</p>
      <div className="battle-controls">
        <button type="button" disabled={finished} onClick={() => setPlaying(p => !p)}>{playing && !finished ? "Pause" : "Play"}</button>
        <button type="button" disabled={finished} onClick={() => { setPlaying(false); setCursor(c => c + 1); }}>Next action</button>
        <button type="button" onClick={() => { setCursor(0); setPlaying(false); }}>Restart replay</button>
        <button type="button" disabled={finished} onClick={() => { setCursor(report.events.length); setPlaying(false); }}>Show result</button>
        <label>Speed <select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option></select></label>
        <span>{cursor} / {report.events.length} actions</span>
      </div>
    </> : <p>This older report has no unit snapshots. Its full event log is available below.</p>}
    {(finished || !units.length) && extra}
    <details><summary>Full combat log ({report.events.length} events)</summary><div className="combat-log-scroll" role="region" aria-label="Battle event log" tabIndex={0}><ol className="battle-log">{report.events.map((e, i) => <li key={i}>Round {e.round} / {describe(e)}{e.hpAfter !== null ? ` / ${e.hpAfter} HP remaining` : ""}</li>)}</ol></div></details>
  </section>;
}

export function BattleResultPanel(props: { report: BattleReportView; extra?: ReactNode }) {
  return <Playback key={props.report.reportId} {...props} />;
}
