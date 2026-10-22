import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SkillLabel } from "./SkillLabel.js";
import { CLASS_SKILLS } from "../frozenIds.js";
import { skillCopy } from "../copy.js";
import { skillMechanics } from "../skillMechanics.js";

afterEach(cleanup);

it("exposes existing copy and mechanics on hover, keyboard focus and tap; Escape dismisses", async () => {
  render(<SkillLabel skillId="shield_bash" />);
  const label = screen.getByRole("button", { name: "Shield Bash" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseEnter(label);
  expect(screen.getByRole("tooltip").textContent).toContain(skillCopy("shield_bash").desc);
  expect(screen.getByRole("tooltip").textContent).toContain("-30% ATK, 2 rounds");
  fireEvent.mouseLeave(label);
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  fireEvent.focus(label);
  expect(label.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
  fireEvent.keyDown(label, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.click(label);
  expect(screen.getByRole("tooltip").textContent).toContain("Cooldown: 2 rounds");
  fireEvent.blur(label);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("covers all 30 known skills and leaves legacy or enemy skill IDs readable", () => {
  const skills = Object.values(CLASS_SKILLS).flat();
  expect(skills).toHaveLength(30);
  for (const { skillId } of skills) {
    expect(skillMechanics(skillId)).toBeTruthy();
    expect(skillCopy(skillId).desc).not.toBe("");
  }
  render(<SkillLabel skillId="legacy_strike" />);
  expect(screen.getByText("legacy_strike")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});
