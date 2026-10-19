// Manual Cookie header handling (no @fastify/cookie dependency needed for one
// opaque, server-looked-up session id). HttpOnly + SameSite=Strict per
// architecture.md ("opaque server session in an HttpOnly SameSite cookie").
// No Secure attribute: the dev server is plain HTTP on loopback by design.
export const SESSION_COOKIE_NAME = "bb_session";

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    result[name] = decodeURIComponent(value);
  }
  return result;
}

export function serializeSessionCookie(sessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Strict; Path=/`;
}

export function serializeClearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
