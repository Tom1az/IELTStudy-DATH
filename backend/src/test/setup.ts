import { afterAll } from "vitest";
import { db } from "../prisma/db.ts";

// The database pool keeps Node running, so close it when a test file is done
afterAll(async () => {
  await db.close();
});
