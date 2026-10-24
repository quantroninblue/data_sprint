import { scaleBand, scaleLinear } from "d3-scale";
import { useMemo, useState } from "react";
import type { Continent } from "../lib/data";
import { CONTINENT_ORDER, CONTINENT_SHORT } from "../lib/theme";
import { median, useWidth } from "../lib/util";

export interface SwarmPoint { iso2: string; name: string; continent: Continent; value: number }

interface Props {
  points: SwarmPoint[];
  domain: [number, number];
  format: (v: number) => string;
  selected?: string;
  highlight?: Set<string> | null;
  color: string;
  onSelect?: (iso2: string) => void;
  ariaLabel: string;
}

const M = { top: 10, right: 12, bottom: 30, left: 44 };
const R = 4.5;

export function Beeswarm({ points, domain, format, selected, highlight, color, onSelect, ariaLabel }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<SwarmPoint | null>(null);
  const height = 340;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;

  const x = scaleBand<Continent>().domain(CONTINENT_ORDER).range([0, innerW]).padding(0.12);
  const y = scaleLinear().domain(domain).nice().range([innerH, 0]);

  // Dodge: place dots in value order, nudging sideways until they don't overlap.
  const placed = useMemo(() => {
    const out: (SwarmPoint & { px: number; py: number })[] = [];
    for (const c of CONTINENT_ORDER) {
      const col = points.filter((p) => p.continent === c).sort((a, b) => a.value - b.value);
      const center = (x(c) ?? 0) + x.bandwidth() / 2;
      const here: { px: number; py: number }[] = [];
      for (const p of col) {
        const py = y(p.value);
        let px = center;
        for (let k = 0; k < 60; k++) {
          const off = Math.ceil(k / 2) * (R * 1.1) * (k % 2 ? 1 : -1);
          px = center + off;
          if (here.every((q) => (q.px - px) ** 2 + (q.py - py) ** 2 >= (2 * R + 1.5) ** 2)) break;
        }
        here.push({ px, py });
        out.push({ ...p, px, py });
      }
    }
    return out;
  }, [points, x, y]);

  const stats = CONTINENT_ORDER.map((c) => {
    const v = points.filter((p) => p.continent === c).map((p) => p.value).sort((a, b) => a - b);
    if (!v.length) return null;
    const q = (f: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))];
    return { c, med: median(v), q1: q(0.25), q3: q(0.75), n: v.length };
  });

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${M.left},${M.top})`}>
            {y.ticks(5).map((t) => (
              <g key={t} className="tick" transform={`translate(0,${y(t)})`}>
                <line x2={innerW} />
                <text x={-8} dy="0.32em" textAnchor="end">{format(t)}</text>
              </g>
            ))}
            {y.domain()[0] < 0 && <line className="baseline" x2={innerW} y1={y(0)} y2={y(0)} />}
            {stats.map((s) => s && (
              <g key={s.c}>
                <rect x={x(s.c)} width={x.bandwidth()} y={y(s.q3)} height={Math.max(1, y(s.q1) - y(s.q3))} fill="var(--wash)" rx={4} />
                <line x1={x(s.c)} x2={(x(s.c) ?? 0) + x.bandwidth()} y1={y(s.med)} y2={y(s.med)} stroke="var(--ink)" strokeWidth={2} />
                <text x={(x(s.c) ?? 0) + x.bandwidth() / 2} y={innerH + 18} textAnchor="middle" className="direct-label">
                  {CONTINENT_SHORT[s.c]} <tspan fill="var(--muted)">({s.n})</tspan>
                </text>
              </g>
            ))}
            {placed.map((p) => {
              const dim = highlight && !highlight.has(p.iso2);
              const sel = p.iso2 === selected;
              return (
                <g key={p.iso2} style={{ cursor: "pointer" }} onPointerEnter={() => setHover(p)} onPointerLeave={() => setHover(null)} onClick={() => onSelect?.(p.iso2)}>
                  <circle cx={p.px} cy={p.py} r={12} fill="transparent" />
                  <circle
                    cx={p.px} cy={p.py} r={sel ? 6.5 : R}
                    fill={sel ? "var(--ink)" : color} opacity={dim ? 0.18 : 0.9}
                    stroke="var(--ring)" strokeWidth={2} style={{ transition: "opacity 0.25s" }}
                  />
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {hover && (
        <div className="tooltip" style={{ left: M.left + (placed.find((p) => p.iso2 === hover.iso2)?.px ?? 0), top: M.top + y(hover.value) }}>
          <div className="t-head">{hover.name}</div>
          <div className="t-row"><span className="t-val">{format(hover.value)}</span><span>{CONTINENT_SHORT[hover.continent]}</span></div>
        </div>
      )}
    </div>
  );
}
