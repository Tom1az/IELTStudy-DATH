"""Fit per-skill BKT parameters with pyBKT and export them for the Node backend.

    source .venv/bin/activate
    python ml/fit_bkt.py                       # simulated learners only
    python ml/fit_bkt.py --responses real.csv  # plus real responses exported from Postgres

Output: ml/output/bkt_params.json, copied to backend/src/config/bkt-params.json, which
backend/src/services/bkt-params.ts reads.

Data
----
The platform has too few real answers to fit 20 skills, so each skill gets a cohort of simulated
learners. A simulated learner follows standard BKT with the assumed parameters in
simulation_params.json, each jittered per learner (so the cohort isn't uniform), and answers 6-20
questions on that skill. Real responses, when given, are appended to the same skill's data, so
they pull the fit towards what learners really did.

The real-response CSV has the columns user_id, skill_code, attempt_id, attempt_order, correct (0/1).
Export it with (one row per question-skill tag):

    \\copy (SELECT a.user_id, s.skill_code, r.attempt_id, r.attempt_order, r.is_correct::int AS correct
            FROM question_responses r
            JOIN quiz_attempts a ON a.attempt_id = r.attempt_id
            JOIN question_skills qs ON qs.question_id = r.question_id
            JOIN skills s ON s.skill_id = qs.skill_id
            ORDER BY a.user_id, r.attempt_id, r.attempt_order) TO 'real.csv' CSV HEADER
"""

from __future__ import annotations

import argparse
import json
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd


def _import_pybkt():
    """pyBKT 1.4.3 probes every sklearn metric at import time and only expects a TypeError from the
    ones it can't use. Newer scikit-learn raises AttributeError or ValueError instead, which aborts
    the import. Wrap the probed functions so those errors read as TypeError while pyBKT imports,
    then put the originals back. pyBKT's own metrics (accuracy, auc, rmse) are unaffected."""
    import re

    from sklearn.metrics import _classification, _regression

    originals = []
    for module in (_classification, _regression):
        for name in dir(module):
            fn = getattr(module, name)
            if not callable(fn) or not re.search("_loss$|_score$|_error$", name):
                continue

            def guarded(*args, _fn=fn, **kwargs):
                try:
                    return _fn(*args, **kwargs)
                except (AttributeError, ValueError) as err:
                    raise TypeError(str(err)) from err

            originals.append((module, name, fn))
            setattr(module, name, guarded)
    try:
        from pyBKT.fit import EM_fit
        from pyBKT.models import Model
    finally:
        for module, name, fn in originals:
            setattr(module, name, fn)

    # EM_fit stores the (1, 1) log-likelihood array into a scalar slot, which NumPy >= 2.4 refuses.
    # Hand it a plain float instead; nothing else reads that value.
    run = EM_fit.run

    def run_with_scalar_loglike(*args, **kwargs):
        result = run(*args, **kwargs)
        result["total_loglike"] = float(np.asarray(result["total_loglike"]).reshape(-1)[0])
        return result

    EM_fit.run = run_with_scalar_loglike
    return Model


Model = _import_pybkt()

HERE = Path(__file__).resolve().parent
SIM_PARAMS = HERE / "simulation_params.json"
OUTPUT = HERE / "output" / "bkt_params.json"
# The backend's Docker image only contains backend/, so it reads its own copy (CI checks they match)
BACKEND_COPY = HERE.parent / "backend" / "src" / "config" / "bkt-params.json"

# Plausible ranges. EM can drift into degenerate solutions (e.g. guess > 0.5, where "knowing"
# the skill makes a right answer less likely); clamping keeps the runtime model meaningful.
BOUNDS = {
    "pInit": (0.05, 0.95),
    "pLearn": (0.01, 0.5),
    "pGuess": (0.01, 0.4),
    "pSlip": (0.01, 0.3),
    "pForget": (0.0, 0.1),
}


def simulate(skill: str, params: dict, learners: int, rng: np.random.Generator) -> pd.DataFrame:
    rows = []
    for learner in range(learners):
        # Each learner's own parameters: the skill's values, jittered by up to ±25 %
        p = {k: float(np.clip(v * rng.uniform(0.75, 1.25), 0.01, 0.95)) for k, v in params.items()}
        known = rng.random() < p["pInit"]
        for step in range(int(rng.integers(6, 21))):
            correct = (rng.random() >= p["pSlip"]) if known else (rng.random() < p["pGuess"])
            rows.append({"user_id": f"sim-{learner}", "skill_name": skill, "correct": int(correct), "step": step})
            if not known and rng.random() < p["pLearn"]:
                known = True
    return pd.DataFrame(rows)


def load_real(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.sort_values(["user_id", "attempt_id", "attempt_order"])
    return pd.DataFrame({
        "user_id": "real-" + df["user_id"].astype(str),
        "skill_name": df["skill_code"],
        "correct": df["correct"].astype(int),
        "step": df.groupby(["user_id", "skill_code"]).cumcount(),
    })


def fit_skill(data: pd.DataFrame, seed: int) -> dict:
    data = data.sort_values(["user_id", "step"]).reset_index(drop=True)
    data["order_id"] = np.arange(len(data))
    model = Model(seed=seed, num_fits=5, parallel=False)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model.fit(data=data[["order_id", "user_id", "skill_name", "correct"]], forgets=False)
    p = model.params().reset_index()
    value = lambda name: float(p.loc[p["param"] == name, "value"].iloc[0])
    fitted = {
        "pInit": value("prior"),
        "pLearn": value("learns"),
        "pGuess": value("guesses"),
        "pSlip": value("slips"),
        "pForget": 0.0,
    }
    return {k: round(float(np.clip(v, *BOUNDS[k])), 4) for k, v in fitted.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--responses", type=Path, help="CSV of real responses (see the docstring)")
    parser.add_argument("--learners", type=int, default=300, help="simulated learners per skill")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    sim = json.loads(SIM_PARAMS.read_text())
    defaults = sim["defaults"]
    rng = np.random.default_rng(args.seed)
    real = load_real(args.responses) if args.responses else pd.DataFrame(columns=["user_id", "skill_name", "correct", "step"])

    skills = {}
    report = []
    for code, overrides in sim["skills"].items():
        assumed = {k: v for k, v in {**defaults, **overrides}.items() if k != "pForget"}
        data = pd.concat([simulate(code, assumed, args.learners, rng), real[real["skill_name"] == code]], ignore_index=True)
        fitted = fit_skill(data, args.seed)
        skills[code] = fitted
        report.append((code, assumed, fitted, int((real["skill_name"] == code).sum())))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "method": "pyBKT EM fit per skill (no forgetting), 5 restarts",
        "data": {
            "simulatedLearnersPerSkill": args.learners,
            "realResponses": int(len(real)),
            "seed": args.seed,
        },
        "defaults": defaults,
        "skills": skills,
    }, indent=2) + "\n"
    OUTPUT.write_text(payload)
    BACKEND_COPY.write_text(payload)

    print(f"{'skill':<22} {'pInit':>13} {'pLearn':>13} {'pGuess':>13} {'pSlip':>13}   real")
    for code, assumed, fitted, n_real in report:
        cells = " ".join(f"{assumed[k]:.2f}->{fitted[k]:.2f}".rjust(13) for k in ("pInit", "pLearn", "pGuess", "pSlip"))
        print(f"{code:<22} {cells}   {n_real}")
    print(f"\nWrote {OUTPUT.relative_to(HERE.parent)} and {BACKEND_COPY.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
