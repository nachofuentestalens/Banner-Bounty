// Deterministic simulation and progression rules (design/game/combat.md,
// design/game/economy/baseline.md). Pure: no Date.now(), network, database,
// UI, or unseeded randomness inside — see each module's own notes.

export * from "./rng.js";
export * from "./xp.js";
export * from "./stats.js";
export * from "./combat.js";
export * from "./rewards.js";
export * from "./expedition.js";

export const gamePackageVersion = "0.2.0" as const;
