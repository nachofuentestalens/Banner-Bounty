import { useEffect, useRef, useState } from "react";
import { ApiError, NetworkError, post } from "../api.js";
import { COPY } from "../copy.js";

interface SelectResult {
  accountId: string;
  displayName: string;
}

export function AccountSelector({ onSelected }: { onSelected: (displayName: string) => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState<"A" | "B" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function select(slot: "A" | "B") {
    setPending(slot);
    setError(null);
    try {
      const { data } = await post<SelectResult>("/dev/session/select", { accountSlot: slot });
      onSelected(data.displayName);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else if (err instanceof NetworkError) setError(COPY.state_offline.desc);
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="screen screen-account-selector">
      <h1 ref={headingRef} tabIndex={-1}>
        Banner &amp; Bounty
      </h1>
      <section aria-labelledby="onboarding-heading" className="onboarding-banner">
        <h2 id="onboarding-heading">{COPY.onboarding_local_build.title}</h2>
        <p>{COPY.onboarding_local_build.body}</p>
      </section>
      <div className="account-cards">
        <button type="button" className="account-card" onClick={() => select("A")} disabled={pending !== null} aria-busy={pending === "A"}>
          {pending === "A" ? COPY.state_action_pending.label : "Company A"}
        </button>
        <button type="button" className="account-card" onClick={() => select("B")} disabled={pending !== null} aria-busy={pending === "B"}>
          {pending === "B" ? COPY.state_action_pending.label : "Company B"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="toast-desc">
          {error}
        </p>
      ) : null}
    </main>
  );
}
