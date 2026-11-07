// Current content/combat rules version this server simulates against
// (design/studio/contracts.md: "Expedition.rulesVersion fixed at
// expedition/start is compared against the server's currentRulesVersion").
// Bump this only alongside a recorded combat.md/content.md/baseline.md
// revision; M1 ships one frozen rules generation. Dungeon/arena/boss stay on
// this legacy (combat v2) rules version through M3-08 (M3-08 only replaces
// the expedition settlement algorithm, per contracts.md's M3-05 addition
// section 4 preamble); M3-09/a later task may widen this.
export const CURRENT_RULES_VERSION = 1;

// M3-05 addition: newly-started expeditions use this rules version (combat
// v3: eight classes, races, specializations, variable-duration settlement).
// An expedition already active under CURRENT_RULES_VERSION at migration time
// keeps running the old fixed-60,000ms algorithm verbatim through its next
// settle/stop (contracts.md section 13 step 4); only a *fresh* start adopts
// this version. Sourced from packages/content so the server never hand-picks
// a second number independent of the content package's own versioning.
export { M3_RULES_VERSION as EXPEDITION_RULES_VERSION } from "@banner-and-bounty/content";
