import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, NetworkError, get } from "./api.js";
import type { AccountState } from "./types.js";
import type { SpoilsData } from "./components/SpoilsPanel.js";

export interface Toast {
  id: number;
  kind: "offline" | "rejected" | "server_error" | "conflict";
  title: string;
  desc: string;
  correlationId?: string;
}

let toastSeq = 0;

export interface AccountStateController {
  state: AccountState | null;
  loading: boolean;
  offline: boolean;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  refetch: () => Promise<AccountState | null>;
  applyLocal: (next: AccountState) => void;
  pushToast: (toast: Omit<Toast, "id">) => void;
  /** first-session-redesign.md section 7: held here (not screen-local state) so Spoils survives navigating to another screen and back. */
  spoils: SpoilsData | null;
  setSpoils: (spoils: SpoilsData | null) => void;
  /** Called by a mutation on a `conflict` error: refetches state, then returns. */
  handleConflict: () => Promise<void>;
  /** Called by a mutation on `validation`/`forbidden`/`not_found`. */
  handleRejected: (err: ApiError) => void;
  /** Called by a mutation on `internal`. */
  handleServerError: (err: ApiError) => void;
}

/**
 * Owns the single GET /account/state poll loop (ui-spec.md "Polling, not
 * push": every mutating screen reads from this shared state rather than
 * fetching its own copy, so a settle/equip/etc response and the next poll
 * tick never race each other into inconsistent local state).
 */
export function useAccountState(sessionReady: boolean, pollMs = 5000): AccountStateController {
  const [state, setState] = useState<AccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [spoils, setSpoils] = useState<SpoilsData | null>(null);
  const inFlight = useRef(false);

  const pushToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchOnce = useCallback(async (): Promise<AccountState | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    try {
      const envelope = await get<AccountState>("/account/state");
      setState(envelope.data);
      setOffline(false);
      return envelope.data;
    } catch (err) {
      if (err instanceof NetworkError) {
        setOffline(true);
      } else if (err instanceof ApiError) {
        // unauthenticated surfaces to App.tsx via a null state + the caller's
        // own session bootstrap check; other codes here are unexpected for a
        // GET and are treated like a server error.
        if (err.code !== "unauthenticated") {
          pushToast({ kind: "server_error", title: "Something Went Wrong", desc: err.message, correlationId: err.correlationId });
        }
      }
      return null;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    setLoading(true);
    fetchOnce();
    const interval = setInterval(() => {
      if (!cancelled) fetchOnce();
    }, pollMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionReady, pollMs, fetchOnce]);

  const applyLocal = useCallback((next: AccountState) => setState(next), []);

  const handleConflict = useCallback(async () => {
    pushToast({ kind: "conflict", title: "Action Rejected", desc: "Your company changed elsewhere — refreshing before you try again." });
    await fetchOnce();
  }, [fetchOnce, pushToast]);

  const handleRejected = useCallback(
    (err: ApiError) => {
      pushToast({ kind: "rejected", title: "Action Rejected", desc: err.message });
    },
    [pushToast],
  );

  const handleServerError = useCallback(
    (err: ApiError) => {
      pushToast({ kind: "server_error", title: "Something Went Wrong", desc: err.message, correlationId: err.correlationId });
    },
    [pushToast],
  );

  return { state, loading, offline, toasts, dismissToast, refetch: fetchOnce, applyLocal, pushToast, handleConflict, handleRejected, handleServerError, spoils, setSpoils };
}
