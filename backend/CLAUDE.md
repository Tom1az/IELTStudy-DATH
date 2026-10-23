# Backend conventions

## Layout

```
src/
  server.ts            # listen only
  app.ts               # Express app: middleware, /api-docs, routes, 404 + error handler (exported for tests)
  routes/<name>.ts     # router -> validators -> controller
  controllers/<name>.ts
  middlewares/         # auth / RBAC (Phase 2)
  services/            # business logic: bkt.ts, recommender.ts (Phase 3)
  utils/validator.ts   # validateBody / validateParams + Joi schemas
  utils/db-types.ts    # varchar<N>() brand helper for Prisma VARCHAR columns
  types/express.d.ts   # req.value, req.user
  docs/openapi.yaml    # Swagger contract
  prisma/              # schema.prisma (source), schema.d.ts + schema.json (generated), db.ts
                       # seed.ts + seed-data.ts (npm run seed)
migrations/            # Prisma 8 migration packages (npm run migration:plan / db:migrate), next to src/
```

## Patterns to follow

- **Request flow:** in `routes/<name>.ts`, chain `validateParams(schemas.idSchema, "id")` and `validateBody(schemas.xSchema)`, then the controller. Controllers read **validated** input from `req.value.body` / `req.value.params`, never from `req.body`. Use `routes/user.ts` as the reference.
- Add new Joi schemas to `schemas` in `utils/validator.ts`.
- **Responses:** `res.status(code).json({ <resource>, message })`. Never return `hashedPass` or other secrets (see `toPublicUser` in `controllers/user.ts`).
- **Errors:** Express 5 forwards rejected promises to the error handler, so async controllers need no try/catch. Throw an error or let it propagate. Set `status` on an error for non-500 codes.
- **Prisma 8** (contract API, not classic Prisma Client):
  - Model access: `db.orm.public.<Model>` from `src/prisma/db.ts`, with `.all()`, `.first({...})`, `.where({...}).update(...)`, `.create(...)`, and `db.transaction(async (tx) => ...)`.
  - VARCHAR columns are branded types. Wrap strings with `varchar<255>(value)` from `utils/db-types.ts`, and only after Joi has checked the length.
  - After editing `schema.prisma`, run `npm run contract:emit`. Never hand-edit `schema.d.ts` or `schema.json`.
- **TypeScript:**
  - Node runs `.ts` directly (type stripping), so relative imports use the `.ts` extension.
  - No `enum`, no `namespace` with values, no parameter properties (`erasableSyntaxOnly`). Use string-literal unions.
  - Use `import type` for type-only imports.
- **Tests:** `*.test.ts` next to the code (vitest + supertest), importing `app` from `app.ts`.
