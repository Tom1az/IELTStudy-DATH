"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cx, mmss } from "@/lib/format";

/**
 * Lesson video. Uses a real <video> element when the lesson has a video URL
 * (uploaded to object storage). Seeded lessons have no media file, so the
 * player runs a timed slide-and-caption presentation of the lesson script with
 * the same controls, captions, speed and resume-from-position behaviour.
 */
export interface VideoPlayerHandle {
  seek: (s: number) => void;
}

const RATES = [0.75, 1, 1.25, 1.5, 2];

export function VideoPlayer({
  title, minutes, transcript, strategy, videoUrl, startAt = 0, onProgress, onEnded, seekRef,
}: {
  title: string;
  minutes: number;
  transcript: string;
  strategy: string[];
  videoUrl?: string;
  startAt?: number;
  onProgress?: (seconds: number) => void;
  onEnded?: () => void;
  seekRef?: React.MutableRefObject<VideoPlayerHandle | null>;
}) {
  const duration = minutes * 60 + 5;
  const [t, setT] = useState(Math.min(startAt, duration - 1));
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [cc, setCc] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(startAt);
  const tRef = useRef(t);
  tRef.current = t;

  const segments = useMemo(() => {
    const sentences = transcript.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    const per = duration / Math.max(1, sentences.length);
    return sentences.map((text, i) => ({ start: i * per, end: (i + 1) * per, text }));
  }, [transcript, duration]);
  const current = segments.find((s) => t >= s.start && t < s.end) ?? segments[segments.length - 1];
  const slideIdx = Math.min(strategy.length, Math.floor((t / duration) * (strategy.length + 2)));

  const seek = useCallback((s: number) => {
    const v = Math.max(0, Math.min(duration, s));
    setT(v);
    if (videoRef.current) videoRef.current.currentTime = v;
  }, [duration]);

  useEffect(() => {
    if (seekRef) seekRef.current = { seek: (s) => { seek(s); setPlaying(true); } };
  }, [seek, seekRef]);

  // simulated clock
  useEffect(() => {
    if (!playing || videoUrl) return;
    const id = setInterval(() => {
      setT((x) => {
        const n = x + 0.25 * rate;
        if (n >= duration) {
          setPlaying(false);
          onEnded?.();
          return duration;
        }
        return n;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing, rate, duration, videoUrl, onEnded]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate]);

  // persist position every 10 s of playback and when paused / unmounted
  useEffect(() => {
    if (Math.abs(t - lastSaved.current) >= 10) {
      lastSaved.current = t;
      onProgress?.(t);
    }
  }, [t, onProgress]);
  useEffect(() => {
    if (!playing) onProgress?.(tRef.current);
  }, [playing, onProgress]);
  useEffect(() => () => onProgress?.(tRef.current), [onProgress]);

  const toggle = () => {
    if (videoUrl && videoRef.current) {
      if (videoRef.current.paused) videoRef.current.play(); else videoRef.current.pause();
      return;
    }
    if (t >= duration) setT(0);
    setPlaying((p) => !p);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
    if (e.key === "ArrowRight") seek(t + 5);
    if (e.key === "ArrowLeft") seek(t - 5);
    if (e.key === "c") setCc((c) => !c);
  };

  const started = t > 0 || playing;

  return (
    <div className="overflow-hidden rounded-2xl bg-navy text-white" tabIndex={0} onKeyDown={onKey} aria-label={`Lesson video: ${title}. Space to play or pause, arrow keys to seek, C for captions.`}>
      <div className="relative aspect-[16/8.4] w-full">
        {videoUrl ? (
          <video ref={videoRef} src={videoUrl} className="h-full w-full bg-black object-contain" onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded} onLoadedMetadata={(e) => { e.currentTarget.currentTime = startAt; }} playsInline />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-14">
            {started && (
              <div className="max-w-xl">
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-brand-soft">{slideIdx === 0 ? "Lesson" : slideIdx <= strategy.length ? `Strategy ${slideIdx} of ${strategy.length}` : "Recap"}</p>
                <p className="mt-2 font-serif text-xl font-semibold leading-snug md:text-[26px]">
                  {slideIdx === 0 ? title : slideIdx <= strategy.length ? strategy[slideIdx - 1] : "Mark the lesson complete, then try the practice set while the method is fresh."}
                </p>
              </div>
            )}
          </div>
        )}
        {!playing && (
          <button onClick={toggle} className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-navy shadow-lg transition-transform hover:scale-105" aria-label={t > 0 && t < duration ? "Resume video" : "Play video"}>
            <Play className="ml-1 h-6 w-6 fill-navy" />
          </button>
        )}
        {cc && started && current && (
          <p className="absolute inset-x-6 bottom-3 mx-auto w-fit max-w-[90%] rounded bg-black/70 px-3 py-1.5 text-center text-sm leading-snug" aria-live="polite">{current.text}</p>
        )}
      </div>
      <div className="flex items-center gap-3 bg-[#162236] px-4 py-2.5 text-xs">
        {playing ? (
          <button onClick={toggle} aria-label="Pause"><Pause className="h-4 w-4" /></button>
        ) : (
          <span className="tabular-nums">{mmss(t)}</span>
        )}
        {playing && <span className="tabular-nums">{mmss(t)}</span>}
        <div
          className="group relative h-1.5 flex-1 cursor-pointer rounded-full bg-navy-600"
          role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.round(t)} tabIndex={0}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * duration); }}
          onKeyDown={(e) => { if (e.key === "ArrowRight") seek(t + 5); if (e.key === "ArrowLeft") seek(t - 5); }}
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand-soft" style={{ width: `${(t / duration) * 100}%` }} />
        </div>
        <span className="tabular-nums">{mmss(duration)}</span>
        <button className="w-8 font-semibold" onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])} aria-label={`Playback speed ${rate}x`}>{rate}x</button>
        <button className={cx("font-semibold", !cc && "opacity-50 line-through")} onClick={() => setCc((c) => !c)} aria-pressed={cc} aria-label="Captions">CC</button>
      </div>
    </div>
  );
}
