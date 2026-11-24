# Evaluation (Phase 6)

Numbers from 24/11/2026, on the `feat/backlog` branch. Every result here can be reproduced with the
commands given, and CI reruns the simulation (`npm run eval`) on every push.

## 1. BKT parameters (pyBKT)

`python ml/fit_bkt.py` fits the four BKT parameters of each of the 20 micro-skills with pyBKT
(EM, 5 restarts, no forgetting). The platform does not yet have enough real answers, so each
skill is fitted on 300 simulated learners. Each learner follows the assumed parameters in
`ml/simulation_params.json`, jittered by ±25 % per learner, and answers 6–20 questions.
Real responses exported from Postgres can be added with `--responses`.

| Check | Result |
| --- | --- |
| Skills fitted | 20 / 20 |
| Largest gap, fitted vs assumed `pLearn` | 0.02 |
| Largest gap, fitted vs assumed `pGuess` / `pSlip` | 0.03 / 0.01 |
| Largest gap, fitted vs assumed `pInit` | 0.08 (`L_SPECIFIC_DETAIL`) |
| Runtime | about 1 minute |

The fit recovers the parameters that generated the data. This shows that the pipeline and
the export work. It does not measure real learners. Once enough real responses exist, refit
with `--responses` and commit both JSON files. CI checks that the two copies match.

## 2. Recommender vs baselines (simulation)

`cd backend && npm run eval` runs `src/eval/simulator.ts` with seed 42, 200 simulated learners and
40 steps each, using the fitted parameters. It compares three strategies:

- **hybrid**: the BKT recommender (ranking formula in `openapi.yaml`, `GET /recommendations`).
- **sequential**: the next lesson in course order.
- **popularity**: the most-taken lessons.

| Strategy | Normalised learning gain | Precision@3 | MRR | Time used (min, capped) | Reached mastery |
| --- | --- | --- | --- | --- | --- |
| hybrid | **0.457** | **0.890** | 0.890 | **450** | 0.5 % |
| sequential | 0.392 | 0.772 | 0.856 | 800 | 0 % |
| popularity | 0.434 | 0.818 | **0.910** | 580 | 0 % |

Compared with the targets in `specs.md`:

| Target | Result | Met? |
| --- | --- | --- |
| Learning gain ≥ 15 % over the sequential curriculum | (0.457 − 0.392) / 0.392 = **+16.6 %** | yes |
| Time to mastery 20–30 % shorter | 450 vs 800 minutes = **−43.8 %** | yes, beyond the target |
| Precision@3 and MRR reported | P@3 0.890 (sequential 0.772); MRR 0.890 (popularity 0.910) | reported |

**Limits to state in the report:**

- These are simulated learners whose behaviour follows the same BKT model that the recommender
  uses. That favours the BKT-based strategy.
- "Time" is capped at 40 steps, so it measures how fast learners move, not real time to full
  mastery. Within the cap, almost no simulated learner reaches mastery in every skill (0.5 %).
- Popularity has a slightly higher MRR, because the most popular lessons tend to hit a weak skill
  first. Hybrid is better on gain, Precision@3 and time.

## 3. Latency

`backend/src/routes/recommendations.latency.integration.test.ts` sends 60 requests to
`GET /api/v1/recommendations` through the real app and Postgres. The data set is the size of
the seed (20 skills, 3 courses, 21 lessons). Half the requests also generate and save a new
batch, which is the slower path.

| p50 | p95 | Target |
| --- | --- | --- |
| 5.2 ms | 6.8 ms | p95 < 300 ms ✔ |

These numbers are from a local Postgres. On Render's free plan, add network time to Supabase.
The first request after the service wakes takes about a minute.

## 4. Tests

| Suite | Count | Command |
| --- | --- | --- |
| Backend unit + integration (real Postgres) | 255 tests, 27 files | `cd backend && npm test` |
| Frontend unit | 18 tests | `cd frontend && npm test` |
| End-to-end (Playwright, desktop + mobile) | 14 tests | `cd frontend && npm run test:e2e` (backend running, seed loaded, `RATE_LIMIT_DISABLED=1`) |

CI also migrates an empty database and runs the seed, so every migration is checked from scratch.
