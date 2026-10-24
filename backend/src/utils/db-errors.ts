// Postgres reports a broken UNIQUE constraint (or primary key) with SQLSTATE 23505.
// Prisma 8 puts that code on the thrown error as `sqlState`.
export const isUniqueViolation = (err: unknown) => {
  return typeof err === "object" && err !== null && "sqlState" in err && err.sqlState === "23505";
};
