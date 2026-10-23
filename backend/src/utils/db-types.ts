import type { Varchar } from "@prisma/orm-postgres/target/codec-types";

// Prisma 8 brands VARCHAR columns with their length. Joi has already checked the length,
// so this only applies the brand.
export const varchar = <N extends number>(value: string) => value as Varchar<N>;
