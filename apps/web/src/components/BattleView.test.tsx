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

it("groups units into front and back rows by slot index", () => {
  const formationReport: BattleReportView = {
    ...report,
    reportId: "formation",
    participantsSnapshot: {
      units: [
        { unitId: "vanguard", side: "A", kind: "hero", name: "Vanguard", classId: "class_vanguard", secondaryClassId: null, slotIndex: 0, maxHp: 100 },
        { unitId: "ranger", side: "A", kind: "hero", name: "Ranger", classId: "class_ranger", secondaryClassId: null, slotIndex: 1, maxHp: 100 },
        { unitId: "arcanist", side: "A", kind: "hero", name: "Arcanist", classId: "class_arcanist", secondaryClassId: null, slotIndex: 2, maxHp: 100 },
        { unitId: "cleric", side: "A", kind: "hero", name: "Cleric", classId: "class_cleric", secondaryClassId: null, slotIndex: 3, maxHp: 100 },
        { unitId: "herald", side: "A", kind: "hero", name: "Herald", classId: "class_herald", secondaryClassId: null, slotIndex: 4, maxHp: 100 },
        { unitId: "boss", side: "B", kind: "enemy", name: "The Tollkeeper", classId: null, secondaryClassId: null, slotIndex: 0, maxHp: 200 },
      ],
    },
    events: [],
    result: { outcome: "loss", rounds: 1, finalHp: {} },
  };
  render(<BattleView report={formationReport} />);
  const frontRow = screen.getByLabelText("Company front row");
  const backRow = screen.getByLabelText("Company back row");
  expect(frontRow.textContent).toMatch(/Vanguard/);
  expect(frontRow.textContent).toMatch(/Ranger/);
  expect(frontRow.textContent).toMatch(/Arcanist/);
  expect(frontRow.textContent).not.toMatch(/Cleric/);
  expect(backRow.textContent).toMatch(/Cleric/);
  expect(backRow.textContent).toMatch(/Herald/);
  expect(backRow.textContent).not.toMatch(/Vanguard/);
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
  expect(screen.getByRole("list", { name: "Arcanist status effects" }).textContent).toMatch(/Weakened.*\(2r\)/);
});

it("FS-01: never calls a recorded report live or in progress, mid-replay or finished", () => {
  render(<BattleView report={report} />);
  expect(screen.getByRole("heading", { name: "Replaying recorded fight" })).toBeTruthy();
  expect(screen.queryByText(/battle in progress/i)).toBeNull();
  expect(screen.queryByText(/\blive\b/i)).toBeNull();
  fireEvent.click(screen.getByText("Skip to end"));
  expect(screen.getByRole("heading", { name: "Defeated" })).toBeTruthy();
  expect(screen.queryByText(/\blive\b/i)).toBeNull();
});

it("decrements the status badge duration by one per round and clears it on expiry", () => {
  const withStatus: BattleReportView = {
    ...report,
    reportId: "status-rounds",
    events: [
      { round: 1, type: "shield_bash", sourceId: "boss", targetId: "hero", amount: -10, hpAfter: 90, skillId: "shield_bash", crit: false, dodged: false, statusApplied: { statusId: "status_weaken", duration: 2 }, statusExpired: null, death: false },
      { round: 2, type: "toll_strike", sourceId: "boss", targetId: "hero", amount: -5, hpAfter: 85, skillId: null, crit: false, dodged: false, statusApplied: null, statusExpired: null, death: false },
      { round: 2, type: "status_expire", sourceId: null, targetId: "hero", amount: 0, hpAfter: 85, skillId: null, crit: false, dodged: false, statusApplied: null, statusExpired: "status_weaken", death: false },
    ],
    result: { outcome: "loss", rounds: 2, finalHp: { hero: 85, boss: 200 } },
  };
  render(<BattleView report={withStatus} />);
  fireEvent.click(screen.getByText("Step"));
  expect(screen.getByRole("list", { name: "Arcanist status effects" }).textContent).toMatch(/Weakened.*\(2r\)/);
  fireEvent.click(screen.getByText("Step"));
  expect(screen.getByRole("list", { name: "Arcanist status effects" }).textContent).toMatch(/Weakened.*\(1r\)/);
  fireEvent.click(screen.getByText("Step"));
  expect(screen.queryByRole("list", { name: "Arcanist status effects" })).toBeNull();
});
