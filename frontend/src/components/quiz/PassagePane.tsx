"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import type { Passage } from "@/lib/types";
import { cx } from "@/lib/format";

/**
 * Listening audio. If the set has an uploaded audio file it is played directly;
 * otherwise the recording script is read aloud with the browser's speech
 * synthesis, using different voices for different speakers.
 */
export function ListeningPlayer({ passage, showScript }: { passage: Passage; showScript: boolean }) {
  const lines = passage.audioScript ?? [];
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [supported, setSupported] = useState(true);
  const playingRef = useRef(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);

  const speakers = Array.from(new Set(lines.map((l) => l.speaker ?? "")));

  const speakFrom = (start: number) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const voices = synth.getVoices().filter((v) => v.lang.startsWith("en"));
    const run = (i: number) => {
      if (!playingRef.current || i >= lines.length) {
        setPlaying(false);
        playingRef.current = false;
        if (i >= lines.length) setIdx(lines.length);
        return;
      }
      setIdx(i);
      const u = new SpeechSynthesisUtterance(lines[i].text);
      const sp = speakers.indexOf(lines[i].speaker ?? "");
      if (voices.length) u.voice = voices[(sp * 3) % voices.length];
      u.pitch = sp % 2 ? 1.1 : 0.95;
      u.rate = rate;
      u.lang = "en-GB";
      u.onend = () => run(i + 1);
      u.onerror = () => run(i + 1);
      synth.speak(u);
    };
    run(start);
  };

  const toggle = () => {
    if (passage.audioUrl) return;
    if (playing) {
      playingRef.current = false;
      window.speechSynthesis.cancel();
      setPlaying(false);
    } else {
      playingRef.current = true;
      setPlaying(true);
      speakFrom(idx < 0 || idx >= lines.length ? 0 : idx);
    }
  };

  if (passage.audioUrl) {
    return <audio controls src={passage.audioUrl} className="w-full" aria-label={passage.title} />;
  }

  const progress = lines.length ? Math.max(0, Math.min(1, (idx + (playing ? 0.5 : 0)) / lines.length)) : 0;

  return (
    <div>
      <div className="rounded-2xl bg-navy p-4 text-white">
        <div className="flex items-center gap-3">
          <button onClick={toggle} disabled={!supported} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-navy disabled:opacity-50" aria-label={playing ? "Pause recording" : "Play recording"}>
            {playing ? <Pause className="h-5 w-5 fill-navy" /> : <Play className="ml-0.5 h-5 w-5 fill-navy" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs text-white/80"><Volume2 className="h-3.5 w-3.5" /> Recording · {lines.length} parts</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-600"><div className="h-full bg-brand-soft transition-all" style={{ width: `${progress * 100}%` }} /></div>
          </div>
          <button className="text-xs font-semibold" onClick={() => setRate((r) => (r >= 1.25 ? 0.85 : r + 0.15))} aria-label="Change speed">{rate.toFixed(2).replace(/0$/, "")}x</button>
          <button onClick={() => { playingRef.current = true; setPlaying(true); setIdx(0); speakFrom(0); }} aria-label="Restart recording" className="rounded p-1 hover:bg-white/10"><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>
      {!supported && <p className="mt-3 text-xs text-ink-muted">Audio playback isn&apos;t supported in this browser, so the transcript is shown instead.</p>}
      {(showScript || !supported) && (
        <ol className="mt-5 space-y-3">
          {lines.map((l, i) => (
            <li key={i} className={cx("rounded-lg px-3 py-2 text-[15px] leading-relaxed", i === idx && playing && "bg-skill-l-bg")}>
              {l.speaker && <span className="mr-1.5 font-semibold text-ink">{l.speaker}:</span>}
              <span className="text-ink">{l.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function PassagePane({ passage, revealScript = false }: { passage: Passage; revealScript?: boolean }) {
  const [showScript, setShowScript] = useState(revealScript);
  const label = { reading: "Reading passage", listening: "Listening", writing: "Writing task", speaking: "Speaking task" }[passage.kind];
  return (
    <div>
      <p className="eyebrow-muted">{label}</p>
      <h2 className="mt-2 font-serif text-[26px] font-bold leading-tight md:text-[30px]">{passage.title}</h2>
      {passage.kind === "listening" ? (
        <div className="mt-5">
          {passage.paragraphs.map((p, i) => <p key={i} className="mb-4 text-[15px] leading-relaxed text-ink-muted">{p.text}</p>)}
          <ListeningPlayer passage={passage} showScript={showScript} />
          {!revealScript && (
            <button className="mt-4 text-sm font-semibold text-brand hover:underline" onClick={() => setShowScript((s) => !s)} aria-pressed={showScript}>
              {showScript ? "Hide transcript" : "Show transcript (practice mode)"}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {passage.paragraphs.map((p, i) => (
            <div key={i} className="flex gap-4">
              {p.label && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-sand text-xs font-semibold text-ink">{p.label}</span>}
              <p className="text-[15.5px] leading-[1.75] text-ink">{p.text}</p>
            </div>
          ))}
          {passage.audioScript && passage.kind === "speaking" && <ListeningPlayer passage={passage} showScript={false} />}
        </div>
      )}
    </div>
  );
}
