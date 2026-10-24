import { scaleLinear, scaleUtc } from "d3-scale";
import { area, line } from "d3-shape";
import { useMemo, useState, type ReactNode } from "react";
import type { Series } from "../lib/data";
import { addDays, formatDay, useWidth } from "../lib/util";

export interface TimeSeries {
  key: string;
  label: string;
  color: string;
  values: Series;
  area?: boolean;
  faded?: boolean;
  width?: number;
}

interface Props {
  start: Date; // date of index 0
  series: TimeSeries[];
  height?: number;
  range?: [number, number]; // inclusive index window to show
  yDomain?: [number, number];
  yFormat?: (v: number) => string;
  valueFormat?: (v: number | null) => string;
  zero?: boolean;
  band?: { from: number; to: number; label: string };
  markers?: { i: number; label: string }[];
  directLabels?: boolean;
  draw?: boolean; // lines draw themselves in when the chart scrolls into view
  strokeWidth?: number;
  ariaLabel: string;
  footer?: ReactNode;
}

const M = { top: 12, right: 92, bottom: 26, left: 40 };

export function TimeChart({
  start, series, height = 240, range, yDomain, yFormat = (v) => `${v}`, valueFormat, zero,
  band, markers = [], directLabels = true, draw, strokeWidth = 2, ariaLabel,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = series[0]?.values.length ?? 0;
  const [i0, i1] = range ?? [0, n - 1];
  const right = directLabels ? M.right : 16;
  const innerW = Math.max(0, width - M.left - right);
  const innerH = height - M.top - M.bottom;

  const { x, y, ticksX, ticksY } = useMemo(() => {
    const x = scaleUtc().domain([addDays(start, i0), addDays(start, i1)]).range([0, innerW]);
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (let i = i0; i <= i1; i++) {
      const v = s.values[i];
      if (v !== null && v !== undefined) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (series.some((s) => s.area)) lo = Math.min(0, lo);
    const y = scaleLinear().domain(yDomain ?? [lo, hi]).nice().range([innerH, 0]);
    return { x, y, ticksX: x.ticks(Math.max(2, Math.floor(innerW / 110))), ticksY: y.ticks(4) };
  }, [start, i0, i1, innerW, innerH, series, yDomain]);

  const xi = (i: number) => x(addDays(start, i));
  const visible = (vals: Series) => vals.map((v, i) => (i >= i0 && i <= i1 ? v : null));
  const mkLine = line<number | null>().defined((v) => v !== null).x((_, i) => xi(i)).y((v) => y(v as number));
  const mkArea = area<number | null>().defined((v) => v !== null).x((_, i) => xi(i)).y0(y(Math.max(0, y.domain()[0]))).y1((v) => y(v as number));

  // Direct labels at the last visible value, pushed apart if they collide.
  const labels = useMemo(() => {
    if (!directLabels) return [];
    const items = series.filter((s) => !s.faded).map((s) => {
      let i = i1;
      while (i > i0 && (s.values[i] === null || s.values[i] === undefined)) i--;
      const v = s.values[i];
      return { s, ty: v === null || v === undefined ? null : y(v), i };
    }).filter((d) => d.ty !== null) as { s: TimeSeries; ty: number; i: number }[];
    items.sort((a, b) => a.ty - b.ty);
    const gap = 14;
    const ys = items.map((d) => d.ty);
    for (let k = 1; k < ys.length; k++) if (ys[k] - ys[k - 1] < gap) ys[k] = ys[k - 1] + gap;
    const overflow = ys.length ? ys[ys.length - 1] - innerH : 0;
    if (overflow > 0) for (let k = ys.length - 1; k >= 0; k--) {
      ys[k] -= overflow;
      if (k > 0 && ys[k] - ys[k - 1] >= gap) break;
    }
    return items.map((d, k) => ({ ...d, ly: ys[k] }));
  }, [series, directLabels, i0, i1, y, innerH]);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const d = x.invert(e.clientX - r.left);
    const i = Math.round((d.getTime() - start.getTime()) / 86400000);
    setHover(Math.max(i0, Math.min(i1, i)));
  };

  const fmtVal = valueFormat ?? ((v: number | null) => (v === null ? "–" : yFormat(v)));

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${M.left},${M.top})`}>
            {band && band.to >= i0 && band.from <= i1 && (
              <g>
                <rect x={xi(Math.max(i0, band.from))} width={xi(Math.min(i1, band.to)) - xi(Math.max(i0, band.from))} y={0} height={innerH} fill="var(--band)" />
                <text x={xi(Math.max(i0, band.from)) + 6} y={12} className="annot">{band.label}</text>
              </g>
            )}
            {ticksY.map((t) => (
              <g key={t} className="tick" transform={`translate(0,${y(t)})`}>
                <line x2={innerW} />
                <text x={-8} dy="0.32em" textAnchor="end">{yFormat(t)}</text>
              </g>
            ))}
            {zero && y.domain()[0] < 0 && y.domain()[1] > 0 && <line className="baseline" x2={innerW} y1={y(0)} y2={y(0)} />}
            <line className="baseline" x2={innerW} y1={innerH} y2={innerH} />
            {ticksX.map((t) => (
              <g key={t.toISOString()} className="tick" transform={`translate(${x(t)},${innerH})`}>
                <text y={18} textAnchor="middle">{t.toLocaleDateString("en-GB", { month: "short", year: t.getUTCMonth() === 0 || ticksX.length < 6 ? "2-digit" : undefined, timeZone: "UTC" })}</text>
              </g>
            ))}
            {markers.filter((m) => m.i >= i0 && m.i <= i1).map((m) => (
              <g key={m.label} pointerEvents="none">
                <line x1={xi(m.i)} x2={xi(m.i)} y1={0} y2={innerH} stroke="var(--ink-2)" strokeWidth={1} />
                <text x={xi(m.i) + 6} y={band ? 28 : 12} className="annot-strong">{m.label}</text>
              </g>
            ))}
            {series.map((s, k) => (
              <g key={s.key} opacity={s.faded ? 0.25 : 1} style={{ transition: "opacity 0.25s" }}>
                {s.area && <path d={mkArea(visible(s.values)) ?? ""} fill={s.color} opacity={0.12} />}
                <path
                  d={mkLine(visible(s.values)) ?? ""} fill="none" stroke={s.color} strokeWidth={s.width ?? strokeWidth}
                  strokeLinejoin="round" strokeLinecap="round"
                  {...(draw ? { pathLength: 1, className: "draw", style: { animationDelay: `${k * 120}ms` } } : {})}
                />
              </g>
            ))}
            {labels.map((d, k) => (
              <g key={d.s.key} className={draw ? "draw-fade" : undefined} style={draw ? { animationDelay: `${900 + k * 120}ms` } : undefined}>
                <circle cx={xi(d.i)} cy={d.ty} r={4} fill={d.s.color} stroke="var(--ring)" strokeWidth={2} />
                {Math.abs(d.ly - d.ty) > 3 && <line x1={xi(d.i) + 6} x2={innerW + 8} y1={d.ty} y2={d.ly} stroke="var(--axis)" />}
                <text x={innerW + 10} y={d.ly} dy="0.32em" className="direct-label">{d.s.label}</text>
              </g>
            ))}
            {hover !== null && (
              <g pointerEvents="none">
                <line x1={xi(hover)} x2={xi(hover)} y2={innerH} stroke="var(--ink-2)" strokeWidth={1} />
                {series.filter((s) => !s.faded).map((s) => {
                  const v = s.values[hover];
                  return v === null || v === undefined ? null : (
                    <circle key={s.key} cx={xi(hover)} cy={y(v)} r={4} fill={s.color} stroke="var(--ring)" strokeWidth={2} />
                  );
                })}
              </g>
            )}
            <rect
              width={innerW} height={innerH} fill="transparent"
              onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}
            />
          </g>
        </svg>
      )}
      {hover !== null && (
        <div className="tooltip" style={{ left: M.left + xi(hover), top: M.top + innerH / 2 }}>
          <div className="t-head">{formatDay(addDays(start, hover))}</div>
          {series.filter((s) => !s.faded).map((s) => (
            <div className="t-row" key={s.key}>
              <span className="t-key" style={{ background: s.color }} />
              <span className="t-val">{fmtVal(s.values[hover] ?? null)}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
