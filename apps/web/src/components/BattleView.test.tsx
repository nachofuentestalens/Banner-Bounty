import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BattleView } from "./BattleView.js";
import type { BattleReportView } from "../types.js";

const report: BattleReportView = {
  reportId: "test",
  kind: "boss",
  seed: "1",
  rulesVersion: 1,
  createdAt: "",
  participantsSnapshot: {
    units: [
      { unitId: "hero", side: "A", kind: "hero", name: "Arcanist", classId: "class_arcanist", secondaryClassId: null, slotIndex: 0, maxHp: 100 },
      { unitId: "boss", side: "B", kind: "enemy", name: "The Tollkeeper", classId: null, secondaryClassId: null, slotIndex: 0, maxHp: 200 },
    ],
  },
  events: [
    { round: 1, type: "toll_strike", sourceId: "boss", targetId: "hero", amount: -30, hpAfter: 70, skillId: null, crit: false, dodged: false, statusApplied: null, statusExpired: null, death: false },
    { round: 1, type: "mending_light", sourceId: "hero", targetId: "hero", amount: 20, hpAfter: 90, skillId: "mending_light", crit: false, dodged: false, statusApplied: null, statusExpired: null, death: false },
    { round: 2, type: "toll_smash", sourceId: "boss", targetId: "hero", amount: -90, hpAfter: 0, skillId: null, crit: false, dodged: false, statusApplied: null, statusExpired: null, death: true },
  ],
  result: { outcome: "loss", rounds: 2, finalHp: { hero: 0, boss: 200 } },
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("steps authoritative damage, healing, defeat and restarts without granting anything", () => {
  render(<BattleView report={report} extra={<p>Reward summary</p>} />);
  const health = () => screen.getByRole("progressbar", { name: "" }) ?? null;
  expect(screen.getByText("100 / 100 HP")).toBeTruthy();
  fireEvent.click(screen.getByText("Step"));
  expect(screen.getByText("70 / 100 HP")).toBeTruthy();
  fireEvent.click(screen.getByText("Step"));
  expect(screen.getByText("90 / 100 HP")).toBeTruthy();
  fireEvent.click(screen.getByText("Step"));
  expect(screen.getByText("0 / 100 HP")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Defeated" })).toBeTruthy();
  expect(screen.getByText("Reward summary")).toBeTruthy();
  fireEvent.click(screen.getByText("Restart replay"));
  expect(screen.getByText("100 / 100 HP")).toBeTruthy();
  expect(screen.queryByText("Reward summary")).toBeNull();
  void health;
});

it("pauses timers, changes speed, skips to end and resets for a new report", () => {
  vi.useFakeTimers();
  const view = render(<BattleView report={report} />);
  fireEvent.click(screen.getByText("Pause"));
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByText("0 / 3 actions")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "4" } });
  fireEvent.click(screen.getByText("Play"));
  act(() => vi.advanceTimersByTime(240));
  expect(screen.getByText("1 / 3 actions")).toBeTruthy();
  fireEvent.click(screen.getByText("Skip to end"));
  expect(screen.getByText("3 / 3 actions")).toBeTruthy();
  view.rerender(<BattleView report={{ ...report, reportId: "new" }} />);
  expect(screen.getByText("0 / 3 actions")).toBeTruthy();
});

it("starts paused for reduced motion and falls back to a plain log for a legacy report", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const view = render(<BattleView report={report} />);
  expect(screen.getByText("Play")).toBeTruthy();
  view.rerender(<BattleView report={{ ...report, reportId: "old", participantsSnapshot: {} }} />);
  expect(screen.getByText(/older report has no unit snapshots/)).toBeTruthy();
  expect(screen.getByText(/Full combat log/)).toBeTruthy();
});

it("shows a status badge with a visible duration while a buff/debuff is active", () => {
  const withStatus: BattleReportView = {
    ...report,
    reportId: "status",
    events: [
      { round: 1, type: "shield_bash", sourceId: "boss", targetId: "hero", amount: -10, hpAfter: 90, skillId: "shield_bash", crit: false, dodged: false, statusApplied: { statusId: "status_weaken", duration: 2 }, statusExpired: null, death: false },
    ],
    result: { outcome: "loss", rounds: 1, finalHp: { hero: 90, boss: 200 } },
  };
  render(<BattleView report={withStatus} />);
  fireEvent.click(screen.getByText("Step"));
  expect(screen.getByRole("list", { name: "Arcanist status effects" }).textContent).toMatch(/Weakened.*\(1r\)/);
});
