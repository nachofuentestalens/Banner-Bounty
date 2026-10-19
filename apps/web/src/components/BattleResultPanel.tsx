import type { ReactNode } from "react";
import type { BattleReportView } from "../types.js";

const OUTCOME_LABEL: Record<"win" | "loss" | "draw", string> = {
  win: "Victory",
  loss: "Defeated",
  draw: "Draw",
};

/**
 * Shared win/loss/draw result display for Boss and Arena (ui-spec.md
 * "BattleResultPanel"). No copy.md key exists yet for a loss/draw line
 * (ui-spec.md unresolved issue 2); this renders the server's structured
 * `report.result.outcome` with a plain label rather than inventing new
 * narrative copy outside this task's write scope.
 */
export function BattleResultPanel({ report, extra }: { report: BattleReportView; extra?: ReactNode }) {
  return (
    <div className="battle-result-panel" aria-live="polite">
      <h3>{OUTCOME_LABEL[report.result.outcome]}</h3>
      <p>
        {report.result.rounds} round(s) · rules v{report.rulesVersion}
      </p>
      {extra}
      <details>
        <summary>Round-by-round log ({report.events.length} events)</summary>
        <div role="region" aria-label="Battle event log" tabIndex={0} className="combat-log-scroll">
          <table className="combat-log-table">
            <thead>
              <tr>
                <th scope="col">Round</th>
                <th scope="col">Event</th>
                <th scope="col">Source</th>
                <th scope="col">Target</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {report.events.map((event, index) => (
                <tr key={index}>
                  <td>{event.round}</td>
                  <td>{event.type}</td>
                  <td>{event.sourceId ?? "—"}</td>
                  <td>{event.targetId ?? "—"}</td>
                  <td>{event.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
