import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { BossChallengeResultDTO, NoPayloadMutationRequest } from "@banner-and-bounty/contracts";
import { STANDALONE_BOSS_FIRST_CLEAR_REWARD, TOLLKEEPER } from "@banner-and-bounty/content";
import {
  type LevelState,
  applyXpGain,
  buildEnemyCombatants,
  createRngState,
  resolveStandaloneBossReward,
  simulateBattleV2,
  toHeroCombatantsV2,
} from "@banner-and-bounty/game";
import type { Clock } from "../clock.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { BattleReportRepository } from "../repositories/battleReportRepository.js";
import { BossClaimRepository } from "../repositories/bossClaimRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { CURRENT_RULES_VERSION } from "../rulesVersion.js";
import { presentBattle } from "./battlePresentation.js";
import { grantRewards, loadLiveParty, toFrozenMembers } from "./partyLoadout.js";

type BossChallengeResult = BossChallengeResultDTO;

/** contracts.md: seed(accountId, bossId, requestId). Combat ignores it; only the guaranteed drop consumes it. */
export function bossSeed(accountId: string, bossId: string, requestId: string): number {
  return crypto.createHash("sha256").update(`boss:${accountId}:${bossId}:${requestId}`).digest().readUInt32BE(0);
}

// POST /boss/challenge. No entry cost and allowed during an expedition; the
// fight uses live heroes/equipment via combat v2. A win claims the reward
// only if this transaction is the one that moves BossClaim.claimedAt off
// null, so the report, claim, gold, XP and item commit together or not at all.
export function challengeBoss(
  db: DatabaseSync,
  accountId: string,
  request: NoPayloadMutationRequest,
  clock: Clock,
): MutationResult<BossChallengeResult> {
  const bossId = TOLLKEEPER.enemyId;
  return runMutation<BossChallengeResult>(
    db,
    {
      accountId,
      command: "boss/challenge",
      requestId: request.requestId,
      expectedRevision: request.expectedRevision,
      fingerprintPayload: {},
    },
    {
      precondition: () => {
        loadLiveParty(db, accountId);
      },
      apply: () => {
        const members = loadLiveParty(db, accountId);
        const frozen = toFrozenMembers(db, members);
        const heroes = toHeroCombatantsV2(frozen);
        const enemies = buildEnemyCombatants([bossId]);
        const seed = bossSeed(accountId, bossId, request.requestId);
        const battle = simulateBattleV2(heroes, enemies, "boss", seed);

        const now = clock.now().toISOString();
        let reward: BossChallengeResult["reward"] = null;

        if (battle.result === "win" && new BossClaimRepository(db).claimIfUnclaimed(accountId, bossId, now)) {
          const granted = resolveStandaloneBossReward(
            createRngState(seed),
            STANDALONE_BOSS_FIRST_CLEAR_REWARD.xp,
            STANDALONE_BOSS_FIRST_CLEAR_REWARD.gold,
            new ItemRepository(db).countUnequipped(accountId),
          );
          const liveLevels: Record<string, LevelState> = {};
          for (const member of members) liveLevels[member.hero.heroId] = applyXpGain({ level: member.hero.level, xp: member.hero.xp }, granted.xp);
          const { items } = grantRewards(
            db,
            accountId,
            { gold: granted.gold, levels: liveLevels, drops: granted.itemInstance ? [granted.itemInstance] : [] },
            now,
          );
          reward = {
            xp: granted.xp,
            gold: granted.gold,
            items,
            overflowConvertedGold: granted.overflowConverted ? granted.gold - STANDALONE_BOSS_FIRST_CLEAR_REWARD.gold : 0,
          };
        }

        const report: BossChallengeResult["report"] = {
          reportId: crypto.randomUUID(),
          kind: "boss",
          seed: seed.toString(16).padStart(8, "0"),
          rulesVersion: CURRENT_RULES_VERSION,
          createdAt: now,
          ...presentBattle(battle),
        };
        new BattleReportRepository(db).insert({ ...report, accountId });

        return { result: { report, rewardGranted: reward !== null, reward }, changed: true };
      },
    },
  );
}
