import type { GameStateSnapshot } from "@bb/contracts";

/**
 * Placeholder for the authoritative game state owned by the server.
 * The client never mutates this directly; it only receives snapshots.
 */
export function createInitialState(id: string): GameStateSnapshot {
  return { id, version: 0 };
}

export function advanceVersion(state: GameStateSnapshot): GameStateSnapshot {
  return { ...state, version: state.version + 1 };
}
