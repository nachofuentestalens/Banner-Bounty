// Placeholder surface for M1-05 scaffolding. Real simulation functions
// (combat, idle settlement) land in M1-02/M1-04 and must stay pure per
// architecture.md: explicit state, rulesVersion, rngSeed, elapsedDuration;
// no Date.now(), network, database, UI, or unseeded randomness inside.

export const gamePackageVersion = "0.1.0" as const;
