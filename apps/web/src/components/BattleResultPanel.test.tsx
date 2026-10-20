import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BattleResultPanel } from "./BattleResultPanel.js";
import type { BattleReportView } from "../types.js";

const report: BattleReportView = {
  reportId: "test", kind: "boss", seed: "1", rulesVersion: 1, createdAt: "",
  participantsSnapshot: { units: [
    { id: "hero", team: "A", role: "class_arcanist", maxHp: 100 },
    { id: "boss", team: "B", role: "boss_tollkeeper", maxHp: 200 },
  ] },
  events: [
    { round: 1, type: "toll_strike", sourceId: "boss", targetId: "hero", amount: -30, hpAfter: 70 },
    { round: 1, type: "mend", sourceId: "hero", targetId: "hero", amount: 20, hpAfter: 90 },
    { round: 2, type: "toll_smash", sourceId: "boss", targetId: "hero", amount: -90, hpAfter: 0 },
  ],
  result: { outcome: "loss", rounds: 2, finalHp: { hero: 0, boss: 200 } },
};
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("steps authoritative damage, healing, defeat and restarts without granting anything", () => {
  render(<BattleResultPanel report={report} extra={<p>Reward summary</p>}/>);
  const health = () => screen.getByRole("progressbar", { name: "Company Arcanist HP" }).getAttribute("aria-valuenow");
  expect(health()).toBe("100");
  fireEvent.click(screen.getByText("Next action"));
  expect(health()).toBe("70");
  fireEvent.click(screen.getByText("Next action"));
  expect(health()).toBe("90");
  fireEvent.click(screen.getByText("Next action"));
  expect(health()).toBe("0");
  expect(screen.getByRole("heading", { name: "Defeated" })).toBeTruthy();
  expect(screen.getByText("Reward summary")).toBeTruthy();
  fireEvent.click(screen.getByText("Restart replay"));
  expect(health()).toBe("100");
  expect(screen.queryByText("Reward summary")).toBeNull();
});
it("pauses timers, changes speed, skips and resets for a new report", () => {
  vi.useFakeTimers();
  const view = render(<BattleResultPanel report={report}/>);
  fireEvent.click(screen.getByText("Pause"));
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByText("0 / 3 actions")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "4" } });
  fireEvent.click(screen.getByText("Play"));
  act(() => vi.advanceTimersByTime(240));
  expect(screen.getByText("1 / 3 actions")).toBeTruthy();
  fireEvent.click(screen.getByText("Show result"));
  expect(screen.getByText("3 / 3 actions")).toBeTruthy();
  view.rerender(<BattleResultPanel report={{ ...report, reportId: "new" }}/>);
  expect(screen.getByText("0 / 3 actions")).toBeTruthy();
});
it("starts paused for reduced motion and preserves legacy logs", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const view = render(<BattleResultPanel report={report}/>);
  expect(screen.getByText("Play")).toBeTruthy();
  view.rerender(<BattleResultPanel report={{ ...report, reportId: "old", participantsSnapshot: {} }}/>);
  expect(screen.getByText(/older report/)).toBeTruthy();
  expect(screen.getByText(/Full combat log/)).toBeTruthy();
});
