import { db } from "../prisma/db.ts";

// First key of the advisory lock, so these locks can't clash with any other use of them
const LEARNER_LOCK = 7301;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Makes this transaction the only one changing a learner's mastery and recommendations. Postgres
// releases the lock when the transaction ends. Without it, parallel requests for one learner read
// the same mastery, so they fail on the unique key or write the recommendations twice.
export const lockLearner = async (tx: Tx, userId: number) => {
  await tx.execute(
    db.raw.sql`SELECT pg_advisory_xact_lock(${LEARNER_LOCK}::int, ${userId}::int)`
      .affectedCount()
      .build(),
  );
};
