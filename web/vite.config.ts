import { defineConfig } from "vitest/config";

// In dev (`npm run dev`, scripts/dev.sh) Vite serves the page on :5173 and proxies the API to
// the Eider server on :8080. In production the Eider server serves dist/ itself.
const server = process.env.SHOP_SERVER ?? "http://127.0.0.1:8080";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": server, "/openapi.json": server, "/health": server },
  },
  build: { target: "es2022", assetsInlineLimit: 0 },
  test: { include: ["src/**/*.test.ts"] },
});
