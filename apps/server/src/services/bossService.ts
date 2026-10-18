import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { BossChallengeResultDTO, NoPayloadMutationRequest } from "@banner-and-bounty/contracts";
import { TOLLKEEPER } from "@banner-and-bounty/content";
import {
  type LevelState,
  applyXpGain,
  createRngState,
  resolveBossFirstClearReward,
  simulateBattle,
  toHeroCombatants,
} from "@banner-and-bounty/game";
import type { Clock } from "../clock.js";
import { runMutation, type MutationResult } from "../mutation.js";
import { BattleReportRepository } from "../repositories/battleReportRepository.js";
import { BossClaimRepository } from "../repositories/bossClaimRepository.js";
import { ItemRepository } from "../repositories/itemRepository.js";
import { CURRENT_RULES_VERSION } from "../rulesVersion.js";
import { grantRewards, loadLiveParty, toFrozenMembers } from "./partyLoadout.js";

type BossChallengeResult = BossChallengeResultDTO;

/** contracts.md: seed(accountId, bossId, requestId). Combat ignores it; only the guaranteed drop consumes it. */
export function bossSeed(accountId: string, bossId: string, requestId: string): number {
  return crypto.createHash("sha256").update(`boss:${accountId}:${bossId}:${requestId}`).digest().readUInt32BE(0);
}

// POST /boss/challenge. No entry cost and allowed during an expedition; the
// fight uses live heroes/equipment. A win claims the reward only if this
// transaction is the one that moves BossClaim.claimedAt off null, so the
// report, claim, gold, XP and item commit together or not at all.
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
        const party = loadLiveParty(db, accountId);
        const heroes = toHeroCombatants(toFrozenMembers(db, party));
        const battle = simulateBattle(
          heroes,
          [
            {
              id: bossId,
              side: "enemy",
              slot: TOLLKEEPER.slot,
              stats: { maxHp: TOLLKEEPER.hp, atk: TOLLKEEPER.atk, def: TOLLKEEPER.def, spd: TOLLKEEPER.spd },
              isBoss: true,
            },
          ],
          "boss",
        );

        const now = clock.now().toISOString();
        const seed = bossSeed(accountId, bossId, request.requestId);
        let reward: BossChallengeResult["reward"] = null;

        if (battle.result === "win" && new BossClaimRepository(db).claimIfUnclaimed(accountId, bossId, now)) {
          const granted = resolveBossFirstClearReward(createRngState(seed), new ItemRepository(db).countUnequipped(accountId));
          const levels: Record<string, LevelState> = {};
          for (const hero of party) {
            levels[hero.heroId] = applyXpGain({ level: hero.level, xp: hero.xp }, granted.xpPerParticipant);
          }
          const { items } = grantRewards(
            db,
            accountId,
            { gold: granted.gold, levels, drops: granted.itemInstance ? [granted.itemInstance] : [] },
            now,
          );
          reward = {
            xp: granted.xpPerParticipant,
            gold: granted.gold,
            items,
            overflowConvertedGold: granted.overflowConverted ? granted.gold - 150 : 0,
          };
        }

        const report: BossChallengeResult["report"] = {
          reportId: crypto.randomUUID(),
          kind: "boss",
          participantsSnapshot: {
            accountId,
            party: heroes.map((h) => ({
              heroId: h.id,
              position: h.position,
              classId: h.classId,
              specializationId: h.specializationId,
              stats: h.stats,
            })),
            boss: { bossId, hp: TOLLKEEPER.hp, atk: TOLLKEEPER.atk, def: TOLLKEEPER.def, spd: TOLLKEEPER.spd },
          },
          seed: seed.toString(16).padStart(8, "0"),
          rulesVersion: CURRENT_RULES_VERSION,
          events: battle.events as unknown[],
          result: { outcome: battle.result, rounds: battle.rounds, finalHp: { ...battle.finalHp } },
          createdAt: now,
        };
        new BattleReportRepository(db).insert({ ...report, accountId });

        // Every challenge persists a new report, so it is always a change.
        return { result: { report, rewardGranted: reward !== null, reward }, changed: true };
      },
    },
  );
}
