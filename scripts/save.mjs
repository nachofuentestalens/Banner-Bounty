// Local save maintenance: `npm run save:path`, `npm run save:backup`,
// `npm run save:reset -- confirm`. The confirmation is a plain word, not a
// flag, because Windows PowerShell 5.1 drops a bare `--` and npm would then
// swallow `--confirm` as its own config option.
// backup: consistent snapshot via SQLite `VACUUM INTO` (safe while the server
//         runs; includes WAL contents) into data/backups/<timestamp>.sqlite.
// reset:  refuses while the API port answers, always backs up first, then
//         deletes the save and its -wal/-shm files. The next server start
//         recreates seeded accounts A and B.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
// Must match apps/server/src/config.ts DEFAULT_DB_PATH.
const dbPath = path.resolve(process.env.DB_PATH ?? path.join(repoRoot, "data", "banner-and-bounty.sqlite"));
const backupDir = path.join(path.dirname(dbPath), "backups");
const apiPort = Number(process.env.API_PORT ?? 3100);
const apiHost = process.env.API_HOST ?? "127.0.0.1";

function portAnswers(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function backup() {
  if (!fs.existsSync(dbPath)) {
    console.log(`[save] no save at ${dbPath}; nothing to back up`);
    return null;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupDir, `banner-and-bounty-${stamp}.sqlite`);
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  console.log(`[save] backup written: ${target}`);
  return target;
}

const [command, flag] = process.argv.slice(2).filter((arg) => arg !== "--");
switch (command) {
  case "path":
    console.log(dbPath);
    break;
  case "backup":
    backup();
    break;
  case "reset": {
    if (flag !== "confirm" && flag !== "--confirm") {
      console.error("[save] reset deletes the local save (after backing it up). Re-run with: npm run save:reset -- confirm");
      process.exit(1);
    }
    if (await portAnswers(apiPort, apiHost)) {
      console.error(`[save] something is listening on ${apiHost}:${apiPort}; stop the server before resetting.`);
      process.exit(1);
    }
    backup();
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
    console.log(`[save] reset complete; the next server start recreates accounts A and B at ${dbPath}`);
    break;
  }
  default:
    console.error("usage: node scripts/save.mjs path | backup | reset confirm");
    process.exit(1);
}
