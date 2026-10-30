import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CodexScreen } from "./Codex.js";
import { getClassBaseStatsV2 } from "@banner-and-bounty/content";

afterEach(cleanup);

it("shows real base stats and growth per level from shared content, not codex_unavailable", () => {
  render(<CodexScreen initialClassId="class_vanguard" />);
  const stats = getClassBaseStatsV2("class_vanguard");
  expect(screen.getByText(String(stats.hpBase))).toBeTruthy();
  expect(screen.getByText(`+${stats.hpGrowth}`)).toBeTruthy();
  expect(screen.queryByText("Codex entry unavailable.")).toBeNull();
});

it("links a documented class pairing to its partner class detail", () => {
  render(<CodexScreen initialClassId="class_vanguard" />);
  const pairingList = document.querySelector(".codex-pairing-list");
  expect(pairingList).toBeTruthy();
  const pairingLink = within(pairingList as HTMLElement).getByRole("button", { name: "Herald" });
  fireEvent.click(pairingLink);
  expect(screen.getByRole("heading", { level: 2, name: "Herald" })).toBeTruthy();
});
