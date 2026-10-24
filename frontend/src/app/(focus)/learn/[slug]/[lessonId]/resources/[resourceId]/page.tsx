"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Printer } from "lucide-react";
import { lessonApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { ErrorState, PageLoader } from "@/components/ui";
import { Logo } from "@/components/layout/Logo";

const STOP = new Set(["because", "between", "through", "without", "another", "however", "although", "whereas", "several", "therefore", "something", "everyone", "students", "student"]);

function vocabulary(paragraphs: string[], n = 30) {
  const seen = new Map<string, string>();
  for (const p of paragraphs) {
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      let perSentence = 0;
      for (const raw of sentence.split(/[^A-Za-z-]+/).sort((a, b) => b.length - a.length)) {
        const w = raw.toLowerCase();
        if (perSentence >= 2) break;
        if (w.length >= 7 && !STOP.has(w) && !seen.has(w)) { seen.set(w, sentence.trim()); perSentence++; }
        if (seen.size >= n) return [...seen];
      }
    }
  }
  return [...seen];
}

/** Printable resource page — "Download PDF" uses the browser's Save as PDF. */
export default function ResourcePage() {
  const { slug, lessonId, resourceId } = useParams<{ slug: string; lessonId: string; resourceId: string }>();
  const { data, error, loading, reload } = useAsync(() => lessonApi.resource(slug, lessonId, resourceId), [slug, lessonId, resourceId]);
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const { lesson, course, resource, passage } = data;
  const kind = resource.id.endsWith("-vocab") ? "vocab" : resource.id.endsWith("-checklist") ? "checklist" : "slides";

  return (
    <div className="min-h-screen bg-cream print:bg-white">
      <div className="flex items-center justify-between bg-navy px-4 py-3 text-white print:hidden md:px-6">
        <Link href={`/learn/${slug}/${lessonId}`} className="flex items-center gap-2 text-sm font-semibold"><ChevronLeft className="h-4 w-4" /> Back to lesson</Link>
        <button className="btn-light btn-sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Download PDF</button>
      </div>
      <article className="mx-auto max-w-3xl bg-white px-6 py-10 print:max-w-none print:px-0 md:my-8 md:rounded-2xl md:border md:border-line md:px-12">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <Logo />
          <p className="text-xs text-ink-muted">{course.title} · {lesson.skill[0].toUpperCase() + lesson.skill.slice(1)} · Lesson {lesson.order}</p>
        </div>
        <p className="eyebrow mt-8">{resource.title}</p>
        <h1 className="mt-1 font-serif text-3xl font-bold">{lesson.title}</h1>

        {resource.id.startsWith("res-") && (
          <p className="mt-6 rounded-xl bg-sand/70 px-4 py-3 text-sm text-ink-muted">This file was uploaded by your instructor. It will be downloadable once the course is connected to file storage.</p>
        )}
        {kind === "slides" && !resource.id.startsWith("res-") && (
          <div className="mt-8 space-y-6">
            {[{ h: "What this lesson covers", b: lesson.bodyText ?? "" }, ...lesson.strategy.map((s, i) => ({ h: `Strategy ${i + 1}`, b: s }))].map((sl, i) => (
              <section key={i} className="break-inside-avoid rounded-xl border border-line p-6">
                <p className="text-xs font-semibold text-ink-soft">Slide {i + 1}</p>
                <h2 className="mt-1 font-serif text-xl font-bold">{sl.h}</h2>
                <p className="mt-2 leading-relaxed text-ink">{sl.b}</p>
              </section>
            ))}
            {lesson.workedExample && (
              <section className="break-inside-avoid rounded-xl border border-line p-6">
                <p className="text-xs font-semibold text-ink-soft">Slide {lesson.strategy.length + 2}</p>
                <h2 className="mt-1 font-serif text-xl font-bold">Worked example</h2>
                <blockquote className="mt-2 rounded-lg bg-sand px-4 py-3">“{lesson.workedExample.quote}”</blockquote>
                <ul className="mt-3 space-y-1.5 text-sm">{lesson.workedExample.items.map((it) => <li key={it.tag + it.statement}><strong>{it.tag}:</strong> {it.statement} — {it.explanation}</li>)}</ul>
              </section>
            )}
          </div>
        )}

        {kind === "vocab" && passage && (
          <>
            <p className="mt-3 text-sm text-ink-muted">Words from the practice text “{passage.title}”, each with the sentence where it appears. Write a translation or synonym in the right-hand column.</p>
            <table className="table-base mt-6">
              <thead><tr><th className="w-8">#</th><th>Word</th><th>In context</th><th className="w-40 print:w-48">My notes</th></tr></thead>
              <tbody>
                {vocabulary(passage.text).map(([w, ctx], i) => (
                  <tr key={w} className="break-inside-avoid"><td className="text-ink-soft">{i + 1}</td><td className="font-semibold">{w}</td><td className="text-ink-muted">{ctx.replace(new RegExp(`\\b${w}\\b`, "i"), (m) => `«${m}»`)}</td><td /></tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {kind === "checklist" && (
          <ul className="mt-8 space-y-4">
            {lesson.strategy.map((s, i) => (
              <li key={i} className="flex gap-3"><span className="mt-1 h-5 w-5 shrink-0 rounded border-2 border-navy" aria-hidden /><span className="leading-relaxed">{s}</span></li>
            ))}
            <li className="flex gap-3"><span className="mt-1 h-5 w-5 shrink-0 rounded border-2 border-navy" aria-hidden /><span className="leading-relaxed">Check spelling, word limits and that every question has an answer before you submit.</span></li>
          </ul>
        )}
        <p className="mt-10 border-t border-line pt-4 text-[11px] text-ink-soft">IELTStudy is an independent practice platform and is not affiliated with the owners of the IELTS test.</p>
      </article>
    </div>
  );
}
