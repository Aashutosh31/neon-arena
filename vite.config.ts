import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(rootDir, "client"),
  envDir: rootDir,
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
  build: {
    outDir: resolve(rootDir, "dist/client"),
    emptyOutDir: true,
    target: "es2022",
  },
});
