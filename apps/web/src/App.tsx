import { useEffect, useState } from "react";

type HealthState = "checking" | "ok" | "unreachable";

// M1-05 scaffold shell. design/game/interface.md's full company ledger UI
// is built on top of this once the account/expedition endpoints exist.
export function App() {
  const [health, setHealth] = useState<HealthState>("checking");

  useEffect(() => {
    let cancelled = false;
    fetch("/health")
      .then((res) => (res.ok ? setHealth("ok") : setHealth("unreachable")))
      .catch(() => {
        if (!cancelled) setHealth("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Banner &amp; Bounty</h1>
      <p>API status: {health}</p>
    </main>
  );
}
