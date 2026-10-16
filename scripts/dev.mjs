import { spawn } from "node:child_process";
import net from "node:net";

const webPort = Number(process.env.WEB_PORT ?? 5174);
const serverPort = Number(process.env.SERVER_PORT ?? 3100);

function checkPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, "127.0.0.1");
  });
}

async function main() {
  const [webFree, serverFree] = await Promise.all([
    checkPortFree(webPort),
    checkPortFree(serverPort),
  ]);

  if (!webFree) {
    console.error(`[dev] port ${webPort} (web) is already in use. Set WEB_PORT to a free port.`);
  }
  if (!serverFree) {
    console.error(`[dev] port ${serverPort} (server) is already in use. Set SERVER_PORT to a free port.`);
  }
  if (!webFree || !serverFree) {
    process.exit(1);
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const isWindows = process.platform === "win32";
  const env = { ...process.env, WEB_PORT: String(webPort), SERVER_PORT: String(serverPort) };

  const server = spawn(npmCmd, ["run", "dev", "--workspace", "apps/server"], {
    stdio: "inherit",
    env,
    shell: isWindows,
  });
  const web = spawn(npmCmd, ["run", "dev", "--workspace", "apps/web"], {
    stdio: "inherit",
    env,
    shell: isWindows,
  });

  function killTree(child) {
    if (child.pid == null || child.exitCode !== null) return;
    if (isWindows) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill();
    }
  }

  let shuttingDown = false;
  function shutdown(code) {
    if (shuttingDown) return;
    shuttingDown = true;
    killTree(server);
    killTree(web);
    process.exit(code ?? 0);
  }

  server.on("exit", (code) => shutdown(code ?? 1));
  web.on("exit", (code) => shutdown(code ?? 1));
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

main();
