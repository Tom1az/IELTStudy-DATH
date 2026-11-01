"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { meApi } from "@/lib/api";
import { WEAK_MASTERY, type MasteryData } from "@/lib/api/learning";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { SKILL_META, band, fmtDate } from "@/lib/format";
import { SKILL_CATEGORIES } from "@/lib/types";
import { EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton, StatusPill } from "@/components/ui";
import { NotAvailable } from "@/components/NotAvailable";
import { RadarChart } from "@/components/charts";
import { SkillIcon } from "@/components/SkillIcon";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function MasteryMap({ data }: { data: MasteryData }) {
  const average = (category: (typeof SKILL_CATEGORIES)[number]) => {
    const skills = data.skills.filter((s) => s.category === category);
    return skills.length ? skills.reduce((sum, s) => sum + s.mastery, 0) / skills.length : 0;
  };
  const weak = data.skills.filter((s) => s.mastery < WEAK_MASTERY);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
      <section className="card flex flex-col items-center gap-4 p-6 lg:self-start" aria-labelledby="radar-h">
        <h2 id="radar-h" className="self-start text-[17px]">Skill compass</h2>
        <RadarChart
          size={300}
          axes={SKILL_CATEGORIES.map((s) => `${SKILL_META[s].label} ${pct(average(s))}`)}
          values={SKILL_CATEGORIES.map(average)}
          target={WEAK_MASTERY}
        />
        <p className="text-[11px] text-ink-muted">The dashed ring is {pct(WEAK_MASTERY)}. Skills below it get remedial recommendations.</p>
        {data.overall !== null && (
          <div className="flex w-full items-baseline justify-between border-t border-line pt-4">
            <p className="text-xs text-ink-muted">Overall estimated band</p>
            <p className="text-2xl font-extrabold text-brand">{band(data.overall)}</p>
          </div>
        )}
        <p className="text-[10px] leading-normal text-ink-muted">Estimates come from your quizzes. They are not official IELTS scores.</p>
      </section>

      <div className="flex flex-col gap-6">
        {weak.length > 0 && (
          <p className="rounded-xl bg-vanilla px-4 py-3 text-sm text-vanilla-ink">
            <strong>{weak.length} skill{weak.length === 1 ? "" : "s"}</strong> below {pct(WEAK_MASTERY)}. Check{" "}
            <Link href="/my-learning" className="font-bold underline">your dashboard</Link> for the lessons picked for you.
          </p>
        )}
        {SKILL_CATEGORIES.map((category) => {
          const skills = data.skills.filter((s) => s.category === category);
          if (skills.length === 0) return null;
          return (
            <section key={category} className="card p-6" aria-labelledby={`${category}-h`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id={`${category}-h`} className="flex items-center gap-2 text-[17px]">
                  <SkillIcon skill={category} className="h-5 w-5" />
                  {SKILL_META[category].label}
                </h2>
                <span className="text-sm font-extrabold tabular-nums text-brand">{pct(average(category))}</span>
              </div>
              <ul className="flex flex-col gap-4">
                {skills.map((s) => (
                  <li key={s.skillId}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-semibold">{s.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {s.mastery < WEAK_MASTERY && <StatusPill tone="amber">Needs work</StatusPill>}
                        <span className="font-bold tabular-nums">{pct(s.mastery)}</span>
                      </span>
                    </div>
                    <ProgressBar
                      value={s.mastery * 100}
                      color={s.mastery < WEAK_MASTERY ? "bg-skill-r" : SKILL_META[category].bar}
                      track="bg-line/50"
                      height="h-1.5"
                      label={`${s.name} mastery`}
                    />
                    <p className="mt-1 text-[10px] text-ink-muted">
                      {s.observations} answer{s.observations === 1 ? "" : "s"} · updated {fmtDate(s.updatedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SkillMastery() {
  const { data, error, loading, reload } = useAsync(() => meApi.mastery(), []);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && data === null) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="h-10 w-72" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
      </div>
    );
  }
  // The Advanced service (BKT) isn't running or reachable
  if (data === null) {
    return (
      <NotAvailable eyebrow="My learning" title="Skill mastery">
        Skill tracking is not running right now. Start the Advanced service (port 4001) and reload this page.
      </NotAvailable>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <PageHeader eyebrow="My learning" title="Skill mastery" />
      {data.skills.length === 0 ? (
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title="No skills measured yet"
          action={<Link href="/placement" className="btn-primary h-11 px-5">Take the placement quiz</Link>}
        >
          Finish the diagnostic quiz and your skill map appears here. It updates after every quiz you submit.
        </EmptyState>
      ) : (
        <MasteryMap data={data} />
      )}
    </div>
  );
}

export default function SkillMasteryPage() {
  return (
    <RequireRole roles={["learner"]}>
      <SkillMastery />
    </RequireRole>
  );
}
