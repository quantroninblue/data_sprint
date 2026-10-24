import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useState } from "react";
import { useWidth } from "../lib/util";

export interface BandSeries {
  key: string;
  label: string;
  color: string;
  points: { x: number; v: number; lo?: number; hi?: number }[];
}

interface Props {
  series: BandSeries[];
  xDomain: [number, number];
  yDomain?: [number, number];
  xTicks: number[];
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  valueFormat?: (v: number) => string;
  leftNote?: string;
  rightNote?: string;
  shade?: { from: number; to: number; label: string };
  height?: number;
  ariaLabel: string;
}

const M = { top: 14, right: 16, bottom: 34, left: 44 };

/** Lines with 95% bands on a numeric x axis (lags or horizons). Legend always shown for 2+ series. */
export function BandChart({ series, xDomain, yDomain, xTicks, xFormat, yFormat, valueFormat, leftNote, rightNote, shade, height = 240, ariaLabel }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const x = scaleLinear().domain(xDomain).range([0, innerW]);
  const all = series.flatMap((s) => s.points.flatMap((p) => [p.lo ?? p.v, p.hi ?? p.v]));
  const y = scaleLinear().domain(yDomain ?? [Math.min(0, ...all), Math.max(0, ...all)]).nice().range([innerH, 0]);
  const mkLine = line<{ x: number; v: number }>().x((p) => x(p.x)).y((p) => y(p.v));
  const mkBand = area<{ x: number; lo?: number; hi?: number; v: number }>().x((p) => x(p.x)).y0((p) => y(p.lo ?? p.v)).y1((p) => y(p.hi ?? p.v));
  const fmt = valueFormat ?? yFormat;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.round(Math.max(xDomain[0], Math.min(xDomain[1], x.invert(e.clientX - r.left)))));
  };

  return (
    <div className="chart" ref={ref}>
      <div style={{ position: "relative", height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel}>
            <g transform={`translate(${M.left},${M.top})`}>
              {shade && (
                <g>
                  <rect x={x(shade.from)} width={x(shade.to) - x(shade.from)} height={innerH} fill="var(--band)" />
                  <text x={x(shade.from) + 6} y={12} className="annot">{shade.label}</text>
                </g>
              )}
              {y.ticks(4).map((t) => (
                <g key={t} className="tick" transform={`translate(0,${y(t)})`}>
                  <line x2={innerW} />
                  <text x={-8} dy="0.32em" textAnchor="end">{yFormat(t)}</text>
                </g>
              ))}
              {y.domain()[0] < 0 && y.domain()[1] > 0 && <line className="baseline" x2={innerW} y1={y(0)} y2={y(0)} />}
              {xTicks.map((t) => (
                <g key={t} className="tick" transform={`translate(${x(t)},${innerH})`}><text y={18} textAnchor="middle">{xFormat(t)}</text></g>
              ))}
              {leftNote && <text x={0} y={innerH + 32} className="annot">{leftNote}</text>}
              {rightNote && <text x={innerW} y={innerH + 32} className="annot" textAnchor="end">{rightNote}</text>}
              {series.map((s) => (
                <g key={s.key}>
                  {s.points.some((p) => p.lo !== undefined) && <path d={mkBand(s.points) ?? ""} fill={s.color} opacity={0.12} />}
                  <path d={mkLine(s.points) ?? ""} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
                </g>
              ))}
              {hover !== null && (
                <g pointerEvents="none">
                  <line x1={x(hover)} x2={x(hover)} y2={innerH} stroke="var(--ink-2)" />
                  {series.map((s) => {
                    const p = s.points.find((q) => q.x === hover);
                    return p ? <circle key={s.key} cx={x(p.x)} cy={y(p.v)} r={4} fill={s.color} stroke="var(--ring)" strokeWidth={2} /> : null;
                  })}
                </g>
              )}
              <rect width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
            </g>
          </svg>
        )}
        {hover !== null && (
          <div className="tooltip" style={{ left: M.left + x(hover), top: M.top + innerH / 2 }}>
            <div className="t-head">{xFormat(hover)}</div>
            {series.map((s) => {
              const p = s.points.find((q) => q.x === hover);
              return p ? (
                <div className="t-row" key={s.key}>
                  <span className="t-key" style={{ background: s.color }} />
                  <span className="t-val">{fmt(p.v)}</span>
                  <span>{s.label}{p.lo !== undefined && p.hi !== undefined ? ` (${fmt(p.lo)} to ${fmt(p.hi)})` : ""}</span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
        </div>
      )}
    </div>
  );
}
