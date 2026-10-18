import type { Toast } from "../useAccountState.js";
import { COPY } from "../copy.js";

export function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} role={toast.kind === "offline" ? "alert" : toast.kind === "conflict" ? "status" : "alert"} className={`toast toast-${toast.kind}`}>
          <p className="toast-title">{toast.title}</p>
          <p className="toast-desc">{toast.desc}</p>
          {toast.correlationId ? <p className="toast-correlation">Reference: {toast.correlationId}</p> : null}
          {toast.kind !== "conflict" ? (
            <button type="button" onClick={() => onDismiss(toast.id)}>
              Dismiss
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="offline-banner">
      <p className="toast-title">{COPY.state_offline.title}</p>
      <p className="toast-desc">{COPY.state_offline.desc}</p>
      <button type="button" onClick={onRetry}>
        {COPY.action_retry}
      </button>
    </div>
  );
}
