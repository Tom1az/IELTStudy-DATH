import { defineConfig, devices } from "@playwright/test";

// Not PORT: loading backend/.env (for SEED_PASSWORD) sets PORT to the backend's port
const PORT = Number(process.env.E2E_PORT ?? 3001);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.e2e\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.e2e\.spec\.ts/ },
  ],
  webServer: process.env.BASE_URL ? undefined : { command: `npm run build && npm run start -- -p ${PORT}`, url: BASE_URL, reuseExistingServer: true, timeout: 240_000 },
});
