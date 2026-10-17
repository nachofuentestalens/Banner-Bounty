// Local dev launcher: starts the Fastify API and the Vite UI together,
// checks both ports are free first, and shuts both down cleanly on
// Ctrl+C or `npm run dev` being killed (Windows-compatible).
import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const apiPort = Number(process.env.API_PORT ?? 3100);
const webPort = Number(process.env.WEB_PORT ?? 5174);
const apiHost = process.env.API_HOST ?? "127.0.0.1";

function checkPortFree(port, host) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once("error", (err) => {
      if (err.code === "EADDRINUSE") resolve(false);
      else reject(err);
    });
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, host);
  });
}

async function assertPortFree(port, host, label) {
  const free = await checkPortFree(port, host);
  if (!free) {
    console.error(
      `[dev] port ${port} (${label}) is already in use on ${host}. ` +
        `Set ${label === "API" ? "API_PORT" : "WEB_PORT"} to a free port and retry.`,
    );
    process.exit(1);
  }
}

await assertPortFree(apiPort, apiHost, "API");
await assertPortFree(webPort, "127.0.0.1", "WEB");

const isWindows = process.platform === "win32";
// npm ships as npm.cmd on Windows; cmd/bat files require shell:true to spawn
// directly (plain shell:false spawn of a .cmd fails with EINVAL on Node 22).
const npmCmd = isWindows ? "npm.cmd" : "npm";

const children = [
  spawn(npmCmd, ["run", "dev", "--workspace=apps/server"], {
    stdio: "inherit",
    env: process.env,
    shell: isWindows,
  }),
  spawn(npmCmd, ["run", "dev", "--workspace=apps/web"], {
    stdio: "inherit",
    env: process.env,
    shell: isWindows,
  }),
];

function killTree(child) {
  if (isWindows) {
    // The direct child is cmd.exe; /t kills its whole tree (npm -> tsx/vite).
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) killTree(child);
  }
  process.exitCode = code;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

for (const child of children) {
  child.on("exit", (code) => shutdown(code ?? 0));
  child.on("error", (err) => {
    console.error("[dev] failed to start a workspace process", err);
    shutdown(1);
  });
}
