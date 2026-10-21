import { useEffect, useRef, useState } from "react";
import { post, mutationPayload } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState, BossChallengeResult } from "../types.js";
import { COPY } from "../copy.js";
import { BattleView } from "../components/BattleView.js";

export function BossScreen({ state, controller }: { state: AccountState; controller: AccountStateController }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BossChallengeResult | null>(null);
  const claim = state.bossClaims.find((c) => c.bossId === "boss_tollkeeper");
  const alreadyClaimed = claim?.claimedAt != null;

  async function challenge() {
    setPending(true);
    await runMutation(async () => {
      const { data } = await post<BossChallengeResult>("/boss/challenge", mutationPayload(state.revision, {}));
      setResult(data);
      await controller.refetch();
    }, controller);
    setPending(false);
  }

  return (
    <main className="screen screen-boss">
      <h1 ref={headingRef} tabIndex={-1}>
        Boss
      </h1>
      <section aria-labelledby="boss-summary-heading">
        <h2 id="boss-summary-heading">{COPY.boss_tollkeeper.name}</h2>
        <p>{COPY.boss_tollkeeper.desc}</p>
        <p className="reward-state-badge">{alreadyClaimed ? COPY.boss_reward_already_claimed.title : COPY.boss_reward_pending.title}</p>
        <p>{alreadyClaimed ? COPY.boss_reward_already_claimed.desc : COPY.boss_reward_pending.desc}</p>
      </section>
      <button type="button" onClick={challenge} disabled={pending}>
        {pending ? COPY.state_action_pending.label : COPY.action_challenge}
      </button>
      {result ? (
        <BattleView
          report={result.report}
          extra={
            result.report.result.outcome === "win" ? (
              result.rewardGranted && result.reward ? (
                <p>
                  Reward: {result.reward.xp} XP, {result.reward.gold} gold, {result.reward.items.length} item(s)
                </p>
              ) : (
                <p>{COPY.boss_reward_already_claimed.desc}</p>
              )
            ) : (
              <p>Your company was defeated.</p>
            )
          }
        />
      ) : null}
    </main>
  );
}
