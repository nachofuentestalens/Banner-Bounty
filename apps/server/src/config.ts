import path from "node:path";
import { MAX_BODY_BYTES } from "@banner-and-bounty/contracts";

// Loopback-only by default (design/studio/architecture.md: "bind loopback by
// default; document deliberate LAN configuration separately"). Setting
// API_HOST overrides this deliberately; it is never implied by any request.
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3100;

export interface ServerConfig {
  host: string;
  port: number;
  dbPath: string;
  bodyLimitBytes: number;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: env.API_HOST ?? DEFAULT_HOST,
    port: Number(env.API_PORT ?? DEFAULT_PORT),
    dbPath: env.DB_PATH ?? path.resolve(process.cwd(), "data", "banner-and-bounty.sqlite"),
    bodyLimitBytes: MAX_BODY_BYTES,
  };
}
