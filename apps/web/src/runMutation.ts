import { ApiError, NetworkError } from "./api.js";
import type { AccountStateController } from "./useAccountState.js";

/**
 * Shared mutation dispatch: runs `fn`, routes `conflict` to a refetch,
 * `validation`/`forbidden`/`not_found`/`active_expedition` to the rejected
 * toast, `internal` to the server-error toast, and a transport failure to
 * the offline banner (ui-spec.md "Error/async state components"). Returns
 * the successful result or `undefined` on any failure.
 */
export async function runMutation<T>(fn: () => Promise<T>, controller: AccountStateController): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "conflict") {
        await controller.handleConflict();
      } else if (err.code === "internal") {
        controller.handleServerError(err);
      } else {
        controller.handleRejected(err);
      }
    } else if (err instanceof NetworkError) {
      controller.pushToast({ kind: "offline", title: "Reconnecting", desc: "Lost touch with the server. Retrying — your last confirmed state is still safe." });
    } else {
      throw err;
    }
    return undefined;
  }
}
