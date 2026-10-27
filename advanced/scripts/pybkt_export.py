"""
Offline ML pipeline: fit BKT bằng pyBKT rồi xuất tham số cho Node.js runtime.

    pip install pyBKT pandas
    python scripts/pybkt_export.py --data ednet_or_logs.csv --out src/config/bktParams.json

CSV cần các cột: user_id, skill_name, correct (0/1), order_id.
 - EdNet: map `tags`/`part` -> skill_name, `user_answer == correct_answer` -> correct.
 - Log thật của IELTStudy: xuất từ question_responses JOIN question_skills (skill_code -> skill_name).
"""
import argparse, json
import pandas as pd
from pyBKT.models import Model

ap = argparse.ArgumentParser()
ap.add_argument("--data", required=True)
ap.add_argument("--out", default="src/config/bktParams.json")
ap.add_argument("--min-rows", type=int, default=200, help="bỏ skill quá ít dữ liệu (dùng default)")
args = ap.parse_args()

df = pd.read_csv(args.data)
counts = df.groupby("skill_name").size()
df = df[df.skill_name.isin(counts[counts >= args.min_rows].index)]

model = Model(seed=42, num_fits=5)
model.fit(data=df, defaults={"user_id": "user_id", "skill_name": "skill_name", "correct": "correct", "order_id": "order_id"})
params = model.params().reset_index()  # cột: skill, param, class, value

skills = {}
for skill, g in params.groupby("skill"):
    v = {r["param"]: float(r["value"]) for _, r in g.iterrows()}
    # pyBKT: prior, learns, slips, guesses
    skills[skill] = {"pL0": v.get("prior", 0.3), "pT": v.get("learns", 0.12),
                     "pS": min(v.get("slips", 0.1), 0.3), "pG": min(v.get("guesses", 0.2), 0.3)}

cfg = {"threshold": 0.65, "masteredAt": 0.85,
       "default": {"pL0": 0.3, "pT": 0.12, "pS": 0.1, "pG": 0.2}, "skills": skills}
json.dump(cfg, open(args.out, "w"), indent=2, ensure_ascii=False)
print(f"Exported {len(skills)} skills -> {args.out}")
