"use client";

import { cx } from "@/lib/format";

/** Radar chart of mastery (0–1) per axis with an optional target ring. */
export function RadarChart({ axes, values, target, size = 300, color = "#3971B8", compare, compareColor = "#B8921F" }: { axes: string[]; values: number[]; target?: number; size?: number; color?: string; compare?: number[]; compareColor?: string }) {
  const c = size / 2;
  const r = c - 62;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, Math.max(0.02, v)).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-[340px] overflow-visible" role="img" aria-label={`Radar chart: ${axes.map((a, i) => `${a} ${Math.round(values[i] * 100)}%`).join(", ")}`}>
      {[0.25, 0.5, 0.75, 1].map((g) => <polygon key={g} points={poly(axes.map(() => g))} fill="none" stroke="#E0E5D4" strokeWidth={1} />)}
      {axes.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#E0E5D4" />; })}
      {target !== undefined && <polygon points={poly(axes.map(() => target))} fill="none" stroke="#343B1B" strokeDasharray="4 4" strokeWidth={1.2} />}
      {compare && <polygon points={poly(compare)} fill={compareColor} fillOpacity={0.12} stroke={compareColor} strokeWidth={1.5} />}
      <polygon points={poly(values)} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2} />
      {values.map((v, i) => { const [x, y] = pt(i, Math.max(0.02, v)); return <circle key={i} cx={x} cy={y} r={3.5} fill={color} />; })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.14);
        return <text key={a} x={x} y={y} textAnchor={Math.abs(x - c) < 4 ? "middle" : x > c ? "start" : "end"} dominantBaseline="middle" fontSize={11.5} fill="#343B1B" fontWeight={600} fontFamily="Plus Jakarta Sans, sans-serif">{a}</text>;
      })}
    </svg>
  );
}


/** Multi-series line chart, values 0–1. */
export function LineChart({ series, labels, height = 200 }: { series: { name: string; color: string; values: number[] }[]; labels?: string[]; height?: number }) {
  const w = 560;
  const h = height;
  const pad = { l: 34, r: 10, t: 10, b: 24 };
  const n = Math.max(...series.map((s) => s.values.length));
  const all = series.flatMap((s) => s.values);
  const lo = Math.floor(Math.min(...all) * 10) / 10;
  const hi = Math.ceil(Math.max(...all) * 10) / 10;
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / Math.max(0.01, hi - lo)) * (h - pad.t - pad.b);
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={series.map((s) => `${s.name}: ends at ${Math.round(s.values[s.values.length - 1] * 100)}%`).join("; ")}>
        {ticks.map((t) => <g key={t}><line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="#E0E5D4" /><text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#626950">{Math.round(t * 100)}%</text></g>)}
        {series.map((s) => <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />)}
        {labels && labels.map((l, i) => (i % Math.ceil(labels.length / 8) === 0 || i === labels.length - 1) && <text key={i} x={x(i)} y={h - 6} textAnchor="middle" fontSize={10} fill="#626950">{l}</text>)}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-ink-muted">
        {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className={cx("h-2 w-3 rounded-sm")} style={{ background: s.color }} />{s.name}</span>)}
      </figcaption>
    </figure>
  );
}
