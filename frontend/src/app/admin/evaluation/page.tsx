"use client";

import { useState } from "react";
import { FlaskConical, Play } from "lucide-react";
import { adminApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { DEFAULT_SIM, simulate, type SimConfig, type SimResult } from "@/lib/adaptive/simulation";
import { recommendNext } from "@/lib/adaptive/recommender";
import { SKILL_CATEGORIES } from "@/lib/types";
import { SKILL_META, band, cx } from "@/lib/format";
import { ErrorState, PageHeader, PageLoader, Select, Spinner, TextInput } from "@/components/ui";
import { LineChart, RadarChart } from "@/components/charts";
import { recHref } from "@/components/RecommendationList";
import Link from "next/link";

const POLICY = { adaptive: { label: "BKT + content-based (ours)", color: "#0E5C5C" }, sequential: { label: "Static sequential curriculum", color: "#1B2A41" }, popularity: { label: "Popularity baseline", color: "#C3410D" } };
const COURSES = [{ id: "c-foundation", label: "Foundation" }, { id: "c-intermediate", label: "Intermediate" }, { id: "c-advanced", label: "Advanced" }];

export default function EvaluationPage() {
  const [courseId, setCourseId] = useState("c-intermediate");
  const { data, error, loading, reload } = useAsync(() => adminApi.evaluationData(courseId), [courseId]);
  const [cfg, setCfg] = useState<SimConfig>(DEFAULT_SIM);
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);
  const [latency, setLatency] = useState<{ p50: number; p95: number; max: number; n: number } | null>(null);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      setResult(simulate(data.lessons, data.sets, data.skills, data.popularityOrder, cfg));
      setRunning(false);
    }, 30);
  };

  const benchLatency = () => {
    const times: number[] = [];
    const courses = [data.course];
    for (let i = 0; i < 300; i++) {
      const m = Object.fromEntries(data.skills.map((s) => [s.id, Math.random()]));
      const done = data.lessons.filter(() => Math.random() < 0.4).map((l) => l.id);
      const t0 = performance.now();
      recommendNext({ mastery: m, skills: data.skills, courses, lessons: data.lessons, sets: data.sets, enrollments: [{ id: "e", userId: "u", courseId, status: "active", enrolledAt: "", completedLessonIds: done }], k: 3 });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    setLatency({ p50: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1], n: times.length });
  };

  const ours = result?.results.find((r) => r.policy === "adaptive");
  const seq = result?.results.find((r) => r.policy === "sequential");
  const gainImprovement = ours && seq ? (ours.learningGain - seq.learningGain) / Math.max(1e-6, seq.learningGain) : 0;
  const timeReduction = ours && seq ? (seq.timeToMastery - ours.timeToMastery) / seq.timeToMastery : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Admin · advanced component" title="Recommender evaluation">
        Simulated A/B test from the proposal: synthetic learners with hidden skill knowledge study one lesson per step under each policy, then answer its practice set. Same cohort and random seed for every policy.
      </PageHeader>

      <section className="card p-5">
        <div className="grid gap-4 md:grid-cols-6 md:items-end">
          <Select label="Course" value={courseId} onChange={(e) => { setCourseId(e.target.value); setResult(null); }}>{COURSES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
          <TextInput label="Synthetic learners" type="number" min={20} max={1000} value={cfg.learners} onChange={(e) => setCfg({ ...cfg, learners: Math.max(20, Math.min(1000, Number(e.target.value))) })} />
          <TextInput label="Study steps" type="number" min={5} max={60} value={cfg.steps} onChange={(e) => setCfg({ ...cfg, steps: Math.max(5, Math.min(60, Number(e.target.value))) })} />
          <TextInput label="Learn rate" type="number" step={0.05} min={0.1} max={0.9} value={cfg.learnRate} onChange={(e) => setCfg({ ...cfg, learnRate: Number(e.target.value) })} />
          <TextInput label="Random seed" type="number" value={cfg.seed} onChange={(e) => setCfg({ ...cfg, seed: Number(e.target.value) })} />
          <button className="btn-primary h-[42px]" onClick={run} disabled={running}>{running ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" />}Run simulation</button>
        </div>
        <p className="mt-3 text-xs text-ink-muted">Mastery target: {Math.round(cfg.masteryTarget * 100)}% of the {data.skills.length} micro-skills known. BKT slip/guess and the Q-matrix come from the same parameters the live platform uses.</p>
      </section>

      {!result && !running && (
        <div className="card mt-6 flex flex-col items-center gap-2 p-10 text-center text-ink-muted"><FlaskConical className="h-8 w-8" /><p>Run the simulation to compare the three policies.</p></div>
      )}

      {result && ours && seq && (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="card p-5"><p className="eyebrow-muted">Normalised learning gain</p><p className="mt-1 font-serif text-3xl font-bold text-teal">{gainImprovement >= 0 ? "+" : ""}{(gainImprovement * 100).toFixed(0)}%</p><p className="text-xs text-ink-muted">vs sequential · target ≥ +15% · {gainImprovement >= 0.15 ? "met" : "not met"}</p></div>
            <div className="card p-5"><p className="eyebrow-muted">Time to mastery</p><p className="mt-1 font-serif text-3xl font-bold text-teal">−{(timeReduction * 100).toFixed(0)}%</p><p className="text-xs text-ink-muted">study steps vs sequential · target 20–30%</p></div>
            <div className="card p-5"><p className="eyebrow-muted">Precision@3 / MRR</p><p className="mt-1 font-serif text-3xl font-bold">{ours.precisionAt3.toFixed(2)} / {ours.mrr.toFixed(2)}</p><p className="text-xs text-ink-muted">relevant = targets a skill the learner doesn&apos;t know yet</p></div>
          </div>

          <section className="card mt-6 overflow-x-auto p-5">
            <h2 className="font-serif text-lg font-bold">Results by policy</h2>
            <table className="table-base mt-2 min-w-[680px]">
              <thead><tr><th>Policy</th><th>Learning gain g</th><th>Precision@3</th><th>MRR</th><th>Steps to mastery</th><th>Reached mastery</th></tr></thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.policy} className={cx(r.policy === "adaptive" && "bg-teal-tint/40")}>
                    <td className="font-semibold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: POLICY[r.policy].color }} />{POLICY[r.policy].label}</td>
                    <td className="tabular-nums">{r.learningGain.toFixed(3)}</td>
                    <td className="tabular-nums">{r.precisionAt3.toFixed(3)}</td>
                    <td className="tabular-nums">{r.mrr.toFixed(3)}</td>
                    <td className="tabular-nums">{r.timeToMastery.toFixed(1)}</td>
                    <td className="tabular-nums">{Math.round(r.reachedMastery * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-muted">{result.config.learners} learners × {result.config.steps} steps × 3 policies in {result.elapsedMs.toFixed(0)} ms. g = (post − pre) / (max − pre) on a one-item-per-skill diagnostic. Steps to mastery is capped at {result.config.steps + 1} for learners who never reach the target.</p>
          </section>

          <section className="card mt-6 p-5">
            <h2 className="font-serif text-lg font-bold">Expected test score after each step</h2>
            <div className="mt-4"><LineChart series={result.results.map((r) => ({ name: POLICY[r.policy].label, color: POLICY[r.policy].color, values: r.curve }))} labels={result.results[0].curve.map((_, i) => String(i + 1))} /></div>
          </section>
        </>
      )}

      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-serif text-lg font-bold">Re-ranking latency</h2><p className="text-xs text-ink-muted">300 random learner states, full re-rank of {data.lessons.length} lessons. Proposal target: under 300 ms.</p></div>
          <button className="btn-outline" onClick={benchLatency}>Measure</button>
        </div>
        {latency && (
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[["p50", latency.p50], ["p95", latency.p95], ["max", latency.max]].map(([k, v]) => <div key={k as string} className="rounded-xl bg-cream p-3"><p className="font-serif text-2xl font-bold">{(v as number).toFixed(2)} ms</p><p className="text-xs text-ink-muted">{k}</p></div>)}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-1 font-serif text-xl font-bold">Same course, different paths</h2>
        <p className="mb-4 text-sm text-ink-muted">Live recommendations for four seeded learners. Their skill maps differ, so their “Up next” lists differ.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {data.profiles.map((p) => (
            <article key={p.userId} className="card p-5">
              <div className="flex items-center justify-between"><p className="font-semibold">{p.name}</p><span className="text-sm text-ink-muted">Band {band(p.band)} · {p.latencyMs.toFixed(1)} ms</span></div>
              <div className="mt-2 grid grid-cols-[140px_1fr] items-center gap-3">
                <RadarChart size={160} axes={SKILL_CATEGORIES.map((c) => SKILL_META[c].letter)} values={SKILL_CATEGORIES.map((c) => p.categories[c])} target={0.65} />
                <ol className="space-y-2 text-sm">
                  {p.recs.map((r, i) => <li key={r.id}><Link href={recHref(r)} className="font-semibold hover:text-brand">{i + 1}. {r.title}</Link><p className="text-[11.5px] leading-snug text-ink-muted">{r.reason}</p></li>)}
                  {!p.recs.length && <li className="text-ink-muted">No active course.</li>}
                </ol>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
