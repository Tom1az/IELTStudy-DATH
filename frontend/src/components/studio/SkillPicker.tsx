"use client";

import { catalogApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import type { QuestionSkill } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { SKILL_META, cx } from "@/lib/format";

function useSkills() {
  const { data } = useAsync(() => catalogApi.skills(), []);
  return data ?? [];
}

/** Multi-select of the micro-skills a lesson teaches. The recommender matches weak skills to these tags. */
export function SkillPicker({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const SKILLS = useSkills();
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset>
      <legend className="label">Micro-skill tags <span className="font-normal text-ink-soft">(used by the recommender)</span></legend>
      <div className="space-y-2.5 rounded-xl border border-line p-3">
        {SKILL_CATEGORIES.map((c) => (
          <div key={c}>
            <p className={cx("mb-1.5 text-[11px] font-semibold uppercase tracking-eyebrow", SKILL_META[c].text)}>{SKILL_META[c].label}</p>
            <div className="flex flex-wrap gap-1.5">
              {SKILLS.filter((s) => s.category === c).map((s) => {
                const i = value.indexOf(s.id);
                return (
                  <button type="button" key={s.id} onClick={() => toggle(s.id)} aria-pressed={i >= 0}
                    className={cx("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", i >= 0 ? "border-navy bg-navy text-white" : "border-line bg-white text-ink hover:border-navy/40")}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-danger" role="alert">{error}</p>}
    </fieldset>
  );
}

/** Q-matrix editor: which micro-skills a question measures and with what weight. */
export function QMatrixEditor({ value, onChange, error }: { value: QuestionSkill[]; onChange: (v: QuestionSkill[]) => void; error?: string }) {
  const SKILLS = useSkills();
  const add = (id: string) => id && !value.some((v) => v.skillId === id) && onChange([...value, { skillId: id, weight: value.length ? 0.5 : 1 }]);
  return (
    <div>
      <p className="label">Q-matrix (skills measured by this question)</p>
      <ul className="space-y-2">
        {value.map((v, i) => {
          const s = SKILLS.find((x) => x.id === v.skillId);
          return (
            <li key={v.skillId} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
              <span className="flex-1 text-sm">{s?.name ?? v.skillId} <span className="text-xs text-ink-soft">{v.skillId}</span></span>
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                Weight
                <input type="range" min={0.1} max={1} step={0.1} value={v.weight} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} className="accent-navy" aria-label={`Weight for ${s?.name}`} />
                <span className="w-7 tabular-nums text-ink">{v.weight.toFixed(1)}</span>
              </label>
              <button type="button" className="text-xs font-semibold text-ink-muted hover:text-danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>
            </li>
          );
        })}
      </ul>
      <select className="input mt-2" value="" onChange={(e) => add(e.target.value)} aria-label="Add a skill tag">
        <option value="">+ Add a skill tag…</option>
        {SKILL_CATEGORIES.map((c) => (
          <optgroup key={c} label={SKILL_META[c].label}>
            {SKILLS.filter((s) => s.category === c && !value.some((v) => v.skillId === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
        ))}
      </select>
      {error && <p className="mt-1.5 text-xs font-medium text-danger" role="alert">{error}</p>}
    </div>
  );
}
