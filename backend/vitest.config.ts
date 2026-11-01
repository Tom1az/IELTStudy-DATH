import "dotenv/config";
import { defineConfig } from "vitest/config";

// Tests run against a separate database, because every test file wipes it (see src/test/db.ts).
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Create an empty database for tests and add its URL to backend/.env (see .env.example).",
  );
}
// Refuse to run if it points at the dev database, so a test run can never wipe real data
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must point at a different database than DATABASE_URL.");
}

export default defineConfig({
  test: {
    // Set in the test workers before any test file loads. dotenv never overwrites a variable
    // that is already set, so src/prisma/db.ts connects to the test database.
    env: {
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: "test-jwt-secret",
      // Blank, so a real Supabase key in .env can never be used by a test run. Route tests use
      // src/test/fake-storage.ts; services/storage.unit.test.ts mocks the Supabase client.
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_STORAGE_BUCKET: "",
      // Tests never call the Advanced service
      ADVANCED_SERVICE_URL: "",
    },
    // Applies migrations to the test database once per run
    globalSetup: ["./src/test/global-setup.ts"],
    // Closes the database connection after each test file
    setupFiles: ["./src/test/setup.ts"],
    // All test files share one database, so they run one at a time
    fileParallelism: false,
  },
});
