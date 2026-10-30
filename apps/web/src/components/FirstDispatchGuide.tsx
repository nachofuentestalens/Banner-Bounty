// first-session-redesign.md section 5. Inline, non-modal, no focus trap.
// Dismissal is a UI preference only (localStorage), never progression.
import { useState } from "react";
import { post, mutationPayload } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState } from "../types.js";
import { COPY } from "../copy.js";
import { heroOrdinalLabel } from "../rules.js";
import type { Screen } from "../App.js";

const DISMISS_KEY = "bb_first_dispatch_guide_dismissed";

export function isFirstDispatchGuideDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function FirstDispatchGuide({
  state,
  controller,
  onDismiss,
  onNavigate,
  onFocusHero,
}: {
  state: AccountState;
  controller: AccountStateController;
  onDismiss: () => void;
  onNavigate: (screen: Screen) => void;
  onFocusHero: (heroId: string) => void;
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [rowsDone, setRowsDone] = useState(false);
  const [pending, setPending] = useState(false);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // best-effort; worst case the guide reappears next session
    }
    onDismiss();
  }

  async function dispatch() {
    setPending(true);
    await runMutation(async () => {
      await post("/expedition/start", mutationPayload(state.revision, {}));
      await controller.refetch();
      onNavigate("expedition");
    }, controller);
    setPending(false);
  }

  return (
    <section className="first-dispatch-guide" aria-labelledby="guide-heading">
      <div className="guide-header">
        <h2 id="guide-heading">{COPY.guide_step_meet.title}</h2>
        <button type="button" className="guide-dismiss" onClick={dismiss}>
          {COPY.guide_dismiss}
        </button>
      </div>
      <ol className="guide-steps">
        <li aria-current={step === 0 ? "step" : undefined}>
          <h3>1. {COPY.guide_step_meet.title}</h3>
          <p>{COPY.guide_step_meet.body}</p>
          <ul className="guide-hero-links">
            {state.heroes.map((h) => (
              <li key={h.heroId}>
                <button
                  type="button"
                  onClick={() => {
                    onFocusHero(h.heroId);
                    setStep(1);
                  }}
                >
                  {heroOrdinalLabel(state.heroes, h.heroId)}
                </button>
              </li>
            ))}
          </ul>
        </li>
        <li aria-current={step === 1 ? "step" : undefined}>
          <h3>2. {COPY.guide_step_rows.title}</h3>
          <p>{COPY.guide_step_rows.body}</p>
          <button type="button" disabled={rowsDone} onClick={() => { setRowsDone(true); setStep(2); }}>
            Keep this formation
          </button>
        </li>
        <li aria-current={step === 2 ? "step" : undefined}>
          <h3>3. {COPY.guide_step_dispatch.title}</h3>
          <p>{COPY.guide_step_dispatch.body}</p>
          <button type="button" className="next-step-action" disabled={pending} onClick={dispatch}>
            {pending ? COPY.state_action_pending.label : "Start Expedition"}
          </button>
        </li>
      </ol>
    </section>
  );
}
