import { describe, expect, it } from "vitest";
import { canChooseSpecialization, canEditEquipment, isExpeditionActive, isPartyComplete, isSpecUnlocked } from "./rules.js";

describe("isPartyComplete", () => {
  it("is false with no party order", () => {
    expect(isPartyComplete({ partyOrder: null })).toBe(false);
  });
  it("is true with a full 3-hero order", () => {
    expect(isPartyComplete({ partyOrder: { accountId: "a", order: ["h1", "h2", "h3"] } })).toBe(true);
  });
});

describe("isExpeditionActive", () => {
  it("reflects expedition.status", () => {
    expect(isExpeditionActive({ expedition: { status: "none", checkpointAt: null, cyclesCompletedSinceStart: 0 } })).toBe(false);
    expect(
      isExpeditionActive({
        expedition: { status: "active", startedAt: "t", checkpointAt: "t", frozenLoadout: null, rulesVersion: 1, cyclesCompletedSinceStart: 0, wins: 0, losses: 0 },
      }),
    ).toBe(true);
  });
});

describe("spec/equip gating (ui-spec.md disabled.* rules)", () => {
  it("locks specialization choice below level 3", () => {
    expect(isSpecUnlocked({ level: 2 })).toBe(false);
    expect(isSpecUnlocked({ level: 3 })).toBe(true);
  });

  it("only allows choosing a spec once, above level 3, outside an expedition", () => {
    expect(canChooseSpecialization({ level: 3, specializationId: null }, false)).toBe(true);
    expect(canChooseSpecialization({ level: 3, specializationId: null }, true)).toBe(false);
    expect(canChooseSpecialization({ level: 3, specializationId: "spec_guardian" }, false)).toBe(false);
    expect(canChooseSpecialization({ level: 2, specializationId: null }, false)).toBe(false);
  });

  it("freezes equipment edits during an active expedition", () => {
    expect(canEditEquipment(false)).toBe(true);
    expect(canEditEquipment(true)).toBe(false);
  });
});
