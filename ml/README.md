# ML

Offline pipeline. Use the repo-root virtualenv:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r ml/requirements.txt
```

## BKT parameters (Phase 3)

```bash
python ml/fit_bkt.py                       # simulated learners only
python ml/fit_bkt.py --responses real.csv  # plus real responses exported from Postgres
```

Writes `ml/output/bkt_params.json`: per skill `pInit`, `pLearn`, `pGuess`, `pSlip`, `pForget`
(forgetting is not fitted, so it is 0), keyed by `skills.skill_code`. The script also writes an identical
`backend/src/config/bkt-params.json`, which the backend reads at start-up
(`backend/src/services/bkt-params.ts`; the Docker image only contains `backend/`). CI checks the two
files match. A skill missing from it uses `defaults`. Commit both after re-fitting.

**Data.** The platform has too few real answers to fit 20 skills, so each skill gets 300 simulated
learners who follow standard BKT with the assumed parameters in `simulation_params.json` (jittered
±25 % per learner) and answer 6–20 questions. Real responses, when exported (the SQL is in the
docstring of `fit_bkt.py`), are added to the same skill's data. pyBKT fits each skill with EM
(5 restarts) and the results are clamped to plausible ranges (guess ≤ 0.4, slip ≤ 0.3), so a
degenerate fit can't invert the model.

**Compatibility.** pyBKT 1.4.3 predates scikit-learn 1.9 and NumPy 2.4; `fit_bkt.py` works around
both at import time (see `_import_pybkt`), so no package in `site-packages` is edited.

## Evaluation (Phase 6)

`backend/src/eval/simulator.ts` (moved from `advanced/`) compares the BKT recommender with a
sequential curriculum and a popularity baseline: `cd backend && npm run eval`.
