import { useState } from "react";

export function App() {
  const [health, setHealth] = useState<string>("not checked");

  async function checkHealth() {
    try {
      const response = await fetch("/api/health");
      const body = await response.json();
      setHealth(body.status ?? "unknown");
    } catch {
      setHealth("unreachable");
    }
  }

  return (
    <main>
      <h1>Banner &amp; Bounty</h1>
      <p>Local workspace shell. Game state is owned by the server.</p>
      <button onClick={checkHealth}>Check server health</button>
      <p>Server status: {health}</p>
    </main>
  );
}
