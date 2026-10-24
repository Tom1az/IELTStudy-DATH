import { execFileSync } from "node:child_process";

// Runs once before all test files: brings the test database up to the latest migration.
// It does nothing when the database is already up to date.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL!;

  try {
    // Output is captured and only shown on failure (Prisma prints a long JSON report)
    execFileSync("npx", ["prisma", "db", "migrate", "--db", url, "--yes", "--quiet"], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
  } catch (err) {
    const output = err as { stdout?: Buffer; stderr?: Buffer };
    console.error(String(output.stdout ?? ""), String(output.stderr ?? ""));
    // Logged as well as thrown, because vitest 5 can crash while printing a global-setup
    // error ("code.charCodeAt is not a function")
    const message =
      "Could not migrate the test database (see the Prisma output above). Check TEST_DATABASE_URL in backend/.env.";
    console.error(message);
    throw new Error(message);
  }
}
