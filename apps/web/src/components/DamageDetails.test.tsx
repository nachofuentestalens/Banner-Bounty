import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DamageDetails } from "./DamageDetails.js";
import type { BattleEvent } from "../types.js";

afterEach(cleanup);
const event: BattleEvent = { round: 1, type: "strike", sourceId: "a", targetId: "b", amount: -10, hpAfter: 0,
  skillId: "strike", crit: true, dodged: false, statusApplied: null, statusExpired: null, death: true };

it("shows the recorded formula, modifiers, critical and HP clamp", () => {
  render(<DamageDetails event={{ ...event, damageBreakdown: { steps: [
    { kind: "weaken", inputs: [20, 70, 100], value: 14 },
    { kind: "fortify", inputs: [10, 130, 100], value: 13 },
    { kind: "base_damage", inputs: [14, 13], value: 8 },
    { kind: "critical", inputs: [8, 3, 2], value: 12 },
  ], damage: 12, hpBefore: 10, hpLoss: 10 } }} />);
  const text = screen.getByText(/Base damage/).textContent;
  expect(text).toContain("Weakened ATK: floor(20 × 70/100) = 14");
  expect(text).toContain("Fortified DEF: floor(10 × 130/100) = 13");
  expect(text).toContain("Critical damage: floor(8 × 3/2) = 12");
  expect(text).toContain("Resolved damage 12; HP before 10; actual HP loss 10; HP after 0");
});

it("explains skipped damage on dodge and preserves older-report fallback", () => {
  const view = render(<DamageDetails event={{ ...event, amount: 0, dodged: true, crit: false, hpAfter: 10,
    damageBreakdown: { steps: [{ kind: "dodge_roll", inputs: [2, 5], value: 1 }], damage: 0, hpBefore: 10, hpLoss: 0 } }} />);
  expect(screen.getByText(/base damage and critical roll not evaluated/)).toBeTruthy();
  view.rerender(<DamageDetails event={event} />);
  expect(screen.getByText(/unavailable in this older report/)).toBeTruthy();
});
