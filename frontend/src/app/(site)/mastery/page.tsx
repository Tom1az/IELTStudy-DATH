"use client";

import Link from "next/link";
import { useState } from "react";
import { practiceApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import type { SkillCategory } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { SKILL_HEX, SKILL_META, band, cx } from "@/lib/format";
import { ErrorState, PageHeader, PageLoader, StatusPill } from "@/components/ui";
import { RadarChart } from "@/components/charts";
import { SkillTile } from "@/components/SkillIcon";

function status(p: number, threshold: number) {
  if (p >= threshold) return { label: "Mastered", tone: "green" as const };
  if (p >= threshold - 0.2) return { label: "Building", tone: "amber" as const };
  return { label: "Needs review", tone: "red" as const };
}

function MasteryInner() {
  const { data, error, loading, reload } = useAsync(() => practiceApi.mastery(), []);
  const [focus, setFocus] = useState<SkillCategory | "all">("all");
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const { skills, mastery, threshold, bands, overall, categoryMastery, attempts, targetBand, links } = data;

  const radarAxes = focus === "all" ? SKILL_CATEGORIES.map((c) => SKILL_META[c].label) : skills.filter((s) => s.category === focus).map((s) => s.code);
  const radarValues = focus === "all" ? SKILL_CATEGORIES.map((c) => categoryMastery[c]) : skills.filter((s) => s.category === focus).map((s) => mastery[s.id]);
  const below = skills.filter((s) => mastery[s.id] < threshold).length;

  return (
    <div className="container pb-16 pt-10 md:pt-12">
      <PageHeader eyebrow="Skill mastery map" title="Where you are, skill by skill" actions={<Link href="/my-learning" className="btn-outline">Back to My learning</Link>}>
        Each micro-skill is tracked with Bayesian Knowledge Tracing from every practice answer. Skills below {threshold.toFixed(2)} are prioritised in your recommendations.
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.25fr]">
        <section className="card p-6" aria-labelledby="radar-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="radar-h" className="font-serif text-xl font-bold">{focus === "all" ? "All four skills" : `${SKILL_META[focus].label} micro-skills`}</h2>
            <select className="input h-9 w-auto py-1 text-sm" value={focus} onChange={(e) => setFocus(e.target.value as SkillCategory | "all")} aria-label="Radar view">
              <option value="all">All skills</option>
              {SKILL_CATEGORIES.map((c) => <option key={c} value={c}>{SKILL_META[c].label}</option>)}
            </select>
          </div>
          <div className="mt-4 flex justify-center">
            <RadarChart axes={radarAxes} values={radarValues} target={threshold} color={focus === "all" ? "#0E5C5C" : SKILL_HEX[focus]} />
          </div>
          <p className="mt-2 text-center text-xs text-ink-soft">Dashed ring = {threshold.toFixed(2)} mastery target</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2" aria-label="Summary">
          <div className="card p-5">
            <p className="eyebrow-muted">Overall estimate</p>
            <p className="mt-1 font-serif text-4xl font-bold">{band(overall)}</p>
            <p className="mt-1 text-xs text-ink-muted">Target Band {band(targetBand)} · {overall >= targetBand ? "target reached" : `${(targetBand - overall).toFixed(1)} to go`}</p>
          </div>
          <div className="card p-5">
            <p className="eyebrow-muted">Below target</p>
            <p className="mt-1 font-serif text-4xl font-bold">{below} <span className="text-lg text-ink-muted">/ {skills.length}</span></p>
            <p className="mt-1 text-xs text-ink-muted">micro-skills under {threshold.toFixed(2)}</p>
          </div>
          {SKILL_CATEGORIES.map((c) => (
            <button key={c} onClick={() => setFocus(c)} className={cx("card flex items-center gap-3 p-4 text-left transition-colors hover:border-navy/30", focus === c && "border-navy")}>
              <SkillTile skill={c} />
              <span className="flex-1">
                <span className="block text-sm font-semibold">{SKILL_META[c].label}</span>
                <span className="text-xs text-ink-muted">Mastery {categoryMastery[c].toFixed(2)}</span>
              </span>
              <span className="font-serif text-2xl font-bold">{band(bands[c])}</span>
            </button>
          ))}
        </section>
      </div>

      <div className="mt-10 space-y-8">
        {SKILL_CATEGORIES.filter((c) => focus === "all" || c === focus).map((c) => (
          <section key={c} aria-labelledby={`h-${c}`}>
            <h2 id={`h-${c}`} className="mb-3 flex items-center gap-2.5 font-serif text-2xl font-bold"><SkillTile skill={c} size={32} /> {SKILL_META[c].label}</h2>
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              <ul className="divide-y divide-line">
                {skills.filter((s) => s.category === c).map((s) => {
                  const p = mastery[s.id];
                  const st = status(p, threshold);
                  const pre = (s.prerequisites ?? []).map((id) => skills.find((x) => x.id === id)).filter(Boolean);
                  return (
                    <li key={s.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1.3fr_1.4fr_auto] md:items-center">
                      <div>
                        <p className="text-[15px] font-semibold">{s.name} <span className="ml-1 text-xs font-normal text-ink-soft">{s.code}</span></p>
                        <p className="text-xs text-ink-muted">{s.description}</p>
                        {pre.length > 0 && <p className="mt-1 text-[11px] text-ink-soft">Builds on: {pre.map((x) => x!.name).join(", ")}</p>}
                      </div>
                      <div>
                        <div className="relative h-2.5 rounded-full bg-sand" role="meter" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.name} mastery`}>
                          <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: SKILL_HEX[c] }} />
                          <div className="absolute -top-1 h-[18px] w-0.5 bg-ink" style={{ left: `${threshold * 100}%` }} />
                        </div>
                        <p className="mt-1.5 flex justify-between text-xs text-ink-muted"><span className="font-semibold text-ink tabular-nums">{p.toFixed(2)}</span><span>{attempts[s.id] ?? 0} updates</span></p>
                      </div>
                      <div className="flex items-center gap-3 md:justify-end">
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
                        {links[s.id] && p < threshold && <Link href={links[s.id].href} className="btn-outline btn-sm whitespace-nowrap">{links[s.id].label}</Link>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function MasteryPage() {
  return (
    <RequireRole roles={["learner"]}>
      <MasteryInner />
    </RequireRole>
  );
}
