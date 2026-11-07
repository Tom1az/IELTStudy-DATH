import "dotenv/config";
import { defineConfig } from "vitest/config";

// The integration tests wipe their database, so they use a separate one and are skipped without it.
// It needs the backend's migrations (see README.md).
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (testDatabaseUrl && testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must point at a different database than DATABASE_URL.");
}

export default defineConfig({
  test: {
    env: {
      // Never connected to without TEST_DATABASE_URL, but the client needs a valid URL to load
      DATABASE_URL: testDatabaseUrl ?? "postgresql://unused@localhost:5432/unused",
      JWT_SECRET: "test-jwt-secret",
    },
    fileParallelism: false,
  },
});
