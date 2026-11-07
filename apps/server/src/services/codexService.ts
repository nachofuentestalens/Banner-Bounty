// design/studio/contracts.md M3-05 addition section 8: GET /codex. Read-only,
// server-sourced; wraps packages/game's already-pure buildCodexV3().
import { buildCodexV3 } from "@banner-and-bounty/game";
import { M3_RULES } from "@banner-and-bounty/content";

export function getCodex() {
  const codex = buildCodexV3();
  return { rulesVersion: M3_RULES.rulesVersion, classes: codex.classes, races: codex.races, secondaryContributionPercent: codex.secondaryContributionPercent };
}
