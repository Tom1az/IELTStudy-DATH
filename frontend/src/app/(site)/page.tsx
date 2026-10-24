"use client";

import Link from "next/link";
import { catalogApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { LEVEL_THEME, cx, isCoreCourse } from "@/lib/format";
import { SKILL_CATEGORIES } from "@/lib/types";
import { SkillChip, Skeleton } from "@/components/ui";
import { SkillTile } from "@/components/SkillIcon";
import { SiteFooter } from "@/components/layout/SiteHeader";

const SKILL_COPY = {
  listening: "Four recordings, from everyday talk to lectures. Practise form completion, maps and multiple choice.",
  reading: "Skim, scan and locate answers. Drill True / False / Not Given, matching and completion tasks.",
  writing: "Describe graphs for Task 1 and build clear arguments for Task 2, with model answers and checklists.",
  speaking: "Rehearse Parts 1 to 3 with cue cards, useful phrases and pronunciation tips.",
};

const STEPS = [
  { title: "Learn", text: "A short video and written notes explain one question type or skill, with a worked example." },
  { title: "Practise", text: "Right after the lesson, answer IELTS-style questions on the same skill, timed or untimed." },
  { title: "Review", text: "Check answers with explanations, then see your progress by skill and level." },
];

const BARS = [
  { level: 1, name: "Foundation", band: "Band 4.0 – 5.0", h: "h-[150px] md:h-[188px]", cls: "bg-peach text-navy", lab: "text-peach-ink" },
  { level: 2, name: "Intermediate", band: "Band 5.5 – 6.5", h: "h-[215px] md:h-[288px]", cls: "bg-teal text-white", lab: "text-white" },
  { level: 3, name: "Advanced", band: "Band 7.0 and above", h: "h-[280px] md:h-[388px]", cls: "bg-navy text-white", lab: "text-white" },
];

export default function LandingPage() {
  const { user } = useAuth();
  const { data } = useAsync(() => catalogApi.list(), []);
  const courses = data ? ([1, 2, 3].map((lv) => data.courses.find((c) => c.level === lv && isCoreCourse(c)) ?? data.courses.find((c) => c.level === lv)).filter(Boolean) as typeof data.courses) : undefined;

  return (
    <>
      {/* Hero */}
      <section className="container grid items-end gap-12 pt-14 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="pb-2 lg:pb-14">
          <p className="eyebrow mb-5">IELTS Academic · 4 skills · 3 levels</p>
          <h1 className="font-serif text-[34px] font-bold leading-[1.05] tracking-[-0.01em] text-navy sm:text-5xl lg:text-[60px] [overflow-wrap:anywhere]">
            Climb from Band 4 to Band 7, one skill at a time.
          </h1>
          <p className="mt-6 max-w-[580px] text-[17px] leading-relaxed text-ink-muted">
            Enroll in the level that fits you today. Every level trains Listening, Reading, Writing and Speaking, and every lesson ends with an IELTS-style practice set.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/courses" className="btn-primary px-6 py-3">Browse courses</Link>
            {user?.role === "learner" && user.placementDone ? (
              <Link href="/my-learning" className="btn-outline px-6 py-3">Go to my learning</Link>
            ) : (
              <Link href={user ? "/placement" : "/register?next=/placement"} className="btn-outline px-6 py-3">Take the placement quiz</Link>
            )}
          </div>
        </div>
        <div className="flex items-end gap-3 md:gap-4" aria-hidden>
          {BARS.map((b) => (
            <div key={b.level} className={cx("flex min-w-0 flex-1 flex-col justify-end rounded-t-xl p-3 sm:p-4 md:p-5", b.h, b.cls)}>
              <p className={cx("text-[10px] font-semibold uppercase tracking-eyebrow md:text-[11px]", b.level === 1 ? "text-peach-ink" : "text-white")}>Level {b.level}</p>
              <p className={cx("mt-1 break-words font-serif text-[15px] font-bold leading-tight sm:text-lg md:text-[22px]", b.level === 1 && "text-peach-ink")}>{b.name}</p>
              <p className={cx("mt-1 text-xs md:text-[13px]", b.level === 1 ? "text-peach-ink" : "text-white/90")}>{b.band}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Levels */}
      <section className="container pb-0 pt-16 md:pt-20" aria-labelledby="levels-h">
        <div className="mb-6 flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <h2 id="levels-h" className="font-serif text-[28px] font-bold text-navy md:text-[34px]">Choose the level that fits you today</h2>
          <Link href={user ? "/placement" : "/register?next=/placement"} className="text-sm font-semibold text-brand hover:underline">Not sure? Take the 15-minute placement quiz →</Link>
        </div>
        <div className="grid gap-4 pb-1 md:grid-cols-3 md:gap-5">
          {!courses
            ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-[300px]" />)
            : courses.map((c) => (
                <article key={c.id} className="flex min-h-[300px] flex-col rounded-2xl border border-line bg-white p-6 md:min-h-[340px]">
                  <span className={cx("pill w-fit px-2.5 py-1 text-[11px]", LEVEL_THEME[c.level].badge)}>Level {c.level}</span>
                  <h3 className="mt-3 font-serif text-[26px] font-bold text-navy">{c.levelName}</h3>
                  <p className="mt-1 text-sm font-semibold text-brand">{c.bandRange}</p>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">{c.tagline}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {SKILL_CATEGORIES.map((s) => <SkillChip key={s} skill={s} />)}
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-8 text-sm">
                    <span className="text-ink-muted">{c.lessonCount} lessons · ≈ {c.hours} hours</span>
                    <Link href={`/courses/${c.slug}`} className="font-semibold text-brand hover:underline" aria-label={`View ${c.title}`}>View course →</Link>
                  </div>
                </article>
              ))}
        </div>
      </section>

      {/* Four skills */}
      <section className="bg-sand pb-14 pt-12 md:pt-14" aria-labelledby="skills-h">
        <div className="container">
          <h2 id="skills-h" className="font-serif text-[28px] font-bold text-navy md:text-[34px]">Four skills, trained the way IELTS tests them</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SKILL_CATEGORIES.map((s) => (
              <div key={s} className="rounded-2xl border border-line bg-white p-5 md:p-6">
                <SkillTile skill={s} size={40} />
                <h3 className="mt-4 font-serif text-xl font-bold capitalize text-navy">{s}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{SKILL_COPY[s]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How lessons work */}
      <section className="container py-16 md:py-20" aria-labelledby="how-h">
        <h2 id="how-h" className="font-serif text-[28px] font-bold text-navy md:text-[34px]">How every lesson works</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy font-serif text-lg font-bold text-white">{i + 1}</span>
              <div>
                <h3 className="font-serif text-xl font-bold text-navy">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <SiteFooter withLogo />
    </>
  );
}
