import { defineConfig, devices } from "@playwright/test";

// The end-to-end test runs the real thing: the Eider server binary (scripts/build.sh builds
// it) serving the built front end (dist/) and the API from one process, on port 4173.
// Build both first: `sh scripts/build.sh`, or `sh scripts/test.sh`, which runs this too.
const port = Number(process.env.SHOP_E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `../server/target/server ${port}`,
    url: `http://127.0.0.1:${port}/health`,
    env: { SHOP_WEB_DIR: "dist", SHOP_ADMIN_TOKEN: "e2e" },
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
