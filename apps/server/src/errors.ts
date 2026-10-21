import type { ErrorCode, ErrorDTO } from "@banner-and-bounty/contracts";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toErrorDTO(error: AppError, correlationId: string): ErrorDTO {
  return {
    code: error.code,
    message: error.message,
    correlationId,
    ...(error.details ? { details: error.details } : {}),
  };
}

// HTTP status per error code. active_expedition is a conflict-shaped
// precondition failure (contracts.md step 3), so it shares 409 with
// conflict; the JSON `code` field is what callers branch on, not the status.
export const ERROR_STATUS: Record<ErrorCode, number> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  active_expedition: 409,
  active_dungeon: 409,
  internal: 500,
};
