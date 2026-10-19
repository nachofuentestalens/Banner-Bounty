// Thin HTTP client for design/studio/contracts.md's envelope shape. Every
// mutating call carries a client-generated requestId + expectedRevision
// (ui-spec.md "Mutation lifecycle"); this module only shapes requests and
// classifies responses — retry/refetch policy lives in useAccountState.

export type ErrorCode =
  | "validation"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "active_expedition"
  | "internal";

export interface ErrorDTO {
  code: ErrorCode;
  message: string;
  correlationId: string;
  details?: Record<string, unknown>;
}

export interface OkEnvelope<T> {
  ok: true;
  data: T;
  revision?: number;
}

export interface ErrEnvelope {
  ok: false;
  error: ErrorDTO;
}

/** A transport-level failure (no HTTP response at all): offline/DNS/aborted. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("network request failed");
    this.cause = cause;
  }
}

/** A well-formed server error envelope (4xx/5xx with an ErrorDTO body). */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly correlationId: string;
  readonly details?: Record<string, unknown>;
  constructor(error: ErrorDTO) {
    super(error.message);
    this.code = error.code;
    this.correlationId = error.correlationId;
    this.details = error.details;
  }
}

function newRequestId(): string {
  return crypto.randomUUID();
}

async function send<T>(method: string, path: string, body?: unknown): Promise<OkEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }

  let envelope: OkEnvelope<T> | ErrEnvelope;
  try {
    envelope = (await response.json()) as OkEnvelope<T> | ErrEnvelope;
  } catch (cause) {
    throw new NetworkError(cause);
  }

  if (!envelope.ok) throw new ApiError(envelope.error);
  return envelope;
}

export function get<T>(path: string): Promise<OkEnvelope<T>> {
  return send<T>("GET", path);
}

/** Builds a mutation payload with a fresh requestId and the given expectedRevision. */
export function mutationPayload<P extends object>(
  expectedRevision: number,
  extra: P,
): P & { requestId: string; expectedRevision: number } {
  return { requestId: newRequestId(), expectedRevision, ...extra };
}

export function post<T>(path: string, body: unknown): Promise<OkEnvelope<T>> {
  return send<T>("POST", path, body);
}

export function patch<T>(path: string, body: unknown): Promise<OkEnvelope<T>> {
  return send<T>("PATCH", path, body);
}
