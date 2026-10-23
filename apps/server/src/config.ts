import { fileURLToPath } from "node:url";
import { MAX_BODY_BYTES } from "@banner-and-bounty/contracts";

// Loopback-only by default (design/studio/architecture.md: "bind loopback by
// default; document deliberate LAN configuration separately"). Setting
// API_HOST overrides this deliberately; it is never implied by any request.
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3100;

// Resolved from this module's location (src/ under tsx, dist/ when built; both
// sit at apps/server/<dir>/), so `npm run dev` and `npm start` share one save at
// <repo>/data regardless of the launching working directory.
export const DEFAULT_DB_PATH = fileURLToPath(new URL("../../../data/banner-and-bounty.sqlite", import.meta.url));
export const DEFAULT_WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));

export interface ServerConfig {
  host: string;
  port: number;
  dbPath: string;
  bodyLimitBytes: number;
  /** Built client served by the API; undefined when SERVE_WEB=0 (dev, where Vite serves the UI). */
  webDistDir: string | undefined;
  /**
   * Local debug menu (level/XP/gold) for manual testing. Off unless
   * DEBUG_TOOLS=1 is set explicitly, so it never appears for normal play.
   */
  debugToolsEnabled: boolean;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: env.API_HOST ?? DEFAULT_HOST,
    port: Number(env.API_PORT ?? DEFAULT_PORT),
    dbPath: env.DB_PATH ?? DEFAULT_DB_PATH,
    bodyLimitBytes: MAX_BODY_BYTES,
    webDistDir: env.SERVE_WEB === "0" ? undefined : (env.WEB_DIST ?? DEFAULT_WEB_DIST),
    debugToolsEnabled: env.DEBUG_TOOLS === "1",
  };
}
