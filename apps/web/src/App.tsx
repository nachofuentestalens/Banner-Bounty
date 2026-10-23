import { useCallback, useEffect, useState } from "react";
import { ApiError, NetworkError, get, post } from "./api.js";
import { AccountSelector } from "./screens/AccountSelector.js";
import { CompanyScreen } from "./screens/Company.js";
import { ExpeditionScreen } from "./screens/Expedition.js";
import { DungeonScreen } from "./screens/Dungeon.js";
import { InventoryScreen } from "./screens/Inventory.js";
import { BossScreen } from "./screens/Boss.js";
import { ArenaScreen } from "./screens/Arena.js";
import { DebugScreen } from "./screens/Debug.js";
import { NavBar } from "./components/NavBar.js";
import { LoadingPanel } from "./components/LoadingPanel.js";
import { OfflineBanner } from "./components/Toasts.js";
import { ToastList } from "./components/Toasts.js";
import { useAccountState } from "./useAccountState.js";

export type Screen = "company" | "expedition" | "dungeon" | "inventory" | "boss" | "arena" | "debug";

type SessionState = { kind: "checking" } | { kind: "unauthenticated" } | { kind: "offline" } | { kind: "authenticated"; displayName: string };

interface CurrentSession {
  accountId: string;
  displayName: string;
}

export function App() {
  const [session, setSession] = useState<SessionState>({ kind: "checking" });
  const [screen, setScreen] = useState<Screen>("company");
  // Hidden unless the server opts in with DEBUG_TOOLS=1 (apps/server/src/config.ts);
  // off by default so the debug panel never appears for normal play.
  const [debugEnabled, setDebugEnabled] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const { data } = await get<CurrentSession>("/dev/session/current");
      setSession({ kind: "authenticated", displayName: data.displayName });
    } catch (err) {
      if (err instanceof ApiError && err.code === "unauthenticated") {
        setSession({ kind: "unauthenticated" });
      } else {
        setSession({ kind: "offline" });
      }
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    get<{ enabled: boolean }>("/debug/enabled")
      .then(({ data }) => setDebugEnabled(data.enabled))
      .catch(() => setDebugEnabled(false));
  }, []);

  const controller = useAccountState(session.kind === "authenticated");

  if (session.kind === "checking") {
    return <LoadingPanel />;
  }

  if (session.kind === "offline") {
    return (
      <main className="screen">
        <h1 tabIndex={-1}>Banner &amp; Bounty</h1>
        <OfflineBanner onRetry={checkSession} />
      </main>
    );
  }

  if (session.kind === "unauthenticated") {
    return <AccountSelector onSelected={(displayName) => setSession({ kind: "authenticated", displayName })} />;
  }

  async function logout() {
    try {
      await post("/dev/session/logout", {});
    } catch {
      // best-effort; the selector screen is shown regardless, matching
      // ui-spec.md's logout action not blocking on network failure.
    }
    setSession({ kind: "unauthenticated" });
  }

  return (
    <div className="app-shell">
      <NavBar current={screen} onNavigate={setScreen} onLogout={logout} displayName={session.displayName} showDebug={debugEnabled} />
      {controller.offline ? <OfflineBanner onRetry={controller.refetch} /> : null}
      <ToastList toasts={controller.toasts} onDismiss={controller.dismissToast} />
      {controller.loading || !controller.state ? (
        <LoadingPanel />
      ) : screen === "company" ? (
        <CompanyScreen state={controller.state} controller={controller} onGoExpedition={() => setScreen("expedition")} />
      ) : screen === "expedition" ? (
        <ExpeditionScreen state={controller.state} controller={controller} />
      ) : screen === "dungeon" ? (
        <DungeonScreen state={controller.state} controller={controller} />
      ) : screen === "inventory" ? (
        <InventoryScreen state={controller.state} controller={controller} />
      ) : screen === "boss" ? (
        <BossScreen state={controller.state} controller={controller} />
      ) : screen === "arena" ? (
        <ArenaScreen state={controller.state} controller={controller} />
      ) : (
        <DebugScreen state={controller.state} controller={controller} />
      )}
    </div>
  );
}
