import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webPort = Number(process.env.WEB_PORT ?? 5174);
const serverPort = Number(process.env.SERVER_PORT ?? 3100);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${serverPort}`,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
