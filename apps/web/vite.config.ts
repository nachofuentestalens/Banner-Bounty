/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webPort = Number(process.env.WEB_PORT ?? 5174);
const apiPort = Number(process.env.API_PORT ?? 3100);

// Ports deliberately avoid AgentDashboard's own 5190/5173 (design/studio/tech-stack.md).
export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      "/health": `http://127.0.0.1:${apiPort}`,
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
  },
});
