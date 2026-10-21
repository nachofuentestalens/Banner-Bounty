// Deterministic simulation and progression rules (design/game/combat.md,
// design/game/economy/baseline.md). Pure: no Date.now(), network, database,
// UI, or unseeded randomness inside — see each module's own notes.

export * from "./rng.js";
export * from "./xp.js";
export * from "./stats.js";
export * from "./combat.js";
export * from "./rewards.js";
export * from "./expedition.js";

// M2-26: combat v2 engine, dual-class stats, gear rolls/crafting, dungeons.
export * from "./stats2.js";
export * from "./combat2.js";
export * from "./party2.js";
export * from "./encounters2.js";
export * from "./crafting.js";
export * from "./dungeon.js";

export const gamePackageVersion = "0.2.0" as const;
