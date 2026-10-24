import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { useEffect, useMemo, useState } from "react";
import { Section } from "../components/Chrome";
import { TimeChart } from "../components/TimeChart";
import { bestOf, type Series } from "../lib/data";
import { CAT_BY_KEY, catVar, VERSION_BY_KEY } from "../lib/theme";
import { dayDiff, fmtLag, fmtTau, lagMeaning, parseDate, rolling7, useTween, useWidth, zscore } from "../lib/util";
import type { Ctx } from "./ctx";

const M = { top: 14, right: 16, bottom: 34, left: 40 };

/** τ at a fractional lag, interpolated between the two neighbouring whole-day lags. */
function tauAt(taus: Series, lags: number[], lag: number) {
  const k = lag - lags[0];
  const a = taus[Math.floor(k)], b = taus[Math.ceil(k)];
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return a + (b - a) * (k - Math.floor(k));
}

/** Value of a series at a fractional index. */
function at(s: Series, i: number) {
  const lo = Math.floor(i), hi = Math.ceil(i);
  if (lo < 0 || hi >= s.length) return null;
  const a = s[lo], b = s[hi];
  if (a === null || b === null) return null;
  return a + (b - a) * (i - lo);
}

interface CurveProps {
  lags: number[];
  taus: Series;
  other: Series;
  otherLabel: string;
  published?: { lag: number; tau: number } | null;
  lag: number;
  shown: number;
  setLag: (l: number) => void;
  color: string;
}

function LagCurve({ lags, taus, other, otherLabel, published, lag, shown, setLag, color }: CurveProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 260;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const x = scaleLinear().domain([lags[0], lags[lags.length - 1]]).range([0, innerW]);
  const y = scaleLinear().domain([-1, 1]).range([innerH, 0]);
  const path = line<number | null>().defined((v) => v !== null).x((_, i) => x(lags[i])).y((v) => y(v as number));
  const k = lags.indexOf(lag);
  const v = taus[k];

  const pick = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.type === "pointermove" && e.buttons !== 1) return;
    const r = e.currentTarget.getBoundingClientRect();
    setLag(Math.max(lags[0], Math.min(lags[lags.length - 1], Math.round(x.invert(e.clientX - r.left)))));
  };

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Kendall's tau at each lag">
          <g transform={`translate(${M.left},${M.top})`}>
            {[-1, -0.5, 0, 0.5, 1].map((t) => (
              <g key={t} className="tick" transform={`translate(0,${y(t)})`}>
                <line x2={innerW} />
                <text x={-8} dy="0.32em" textAnchor="end">{fmtTau(t)}</text>
              </g>
            ))}
            <line className="baseline" x2={innerW} y1={y(0)} y2={y(0)} />
            {[-28, -14, 0, 14, 28].map((t) => (
              <g key={t} className="tick" transform={`translate(${x(t)},${innerH})`}>
                <text y={18} textAnchor="middle">{t === 0 ? "0" : fmtLag(t)}</text>
              </g>
            ))}
            <text x={0} y={innerH + 32} className="annot">← movement leads</text>
            <text x={innerW} y={innerH + 32} className="annot" textAnchor="end">cases lead →</text>
            <path d={path(other) ?? ""} fill="none" stroke="var(--muted)" strokeWidth={2} strokeLinejoin="round" opacity={0.6} />
            <path d={path(taus) ?? ""} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
            {published && (
              <g pointerEvents="none">
                <rect x={x(published.lag) - 5} y={y(published.tau) - 5} width={10} height={10} transform={`rotate(45 ${x(published.lag)} ${y(published.tau)})`} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} />
              </g>
            )}
            <line x1={x(shown)} x2={x(shown)} y2={innerH} stroke="var(--ink)" strokeWidth={1} />
            {v !== null && v !== undefined && (
              <g>
                <circle cx={x(shown)} cy={y(tauAt(taus, lags, shown) ?? v)} r={6} fill={color} stroke="var(--ring)" strokeWidth={2} />
                <text x={x(shown) + (x(shown) > innerW - 80 ? -10 : 10)} y={y(tauAt(taus, lags, shown) ?? v) - 10} textAnchor={x(shown) > innerW - 80 ? "end" : "start"} className="annot-strong">
                  τ {fmtTau(v)}
                </text>
              </g>
            )}
            <rect width={innerW} height={innerH} fill="transparent" style={{ cursor: "ew-resize" }} onPointerDown={pick} onPointerMove={pick} />
          </g>
        </svg>
      )}
      <div className="legend">
        <span><i style={{ background: color }} />This version</span>
        <span><i style={{ background: "var(--muted)" }} />{otherLabel}</span>
        {published && <span><i style={{ width: 9, height: 9, transform: "rotate(45deg)", border: "2px solid var(--ink)", background: "none" }} />Paper's reported peak</span>}
      </div>
    </div>
  );
}

export function LagExplorer({ d, iso, cat, version }: Ctx) {
  const c = d.byIso[iso];
  const s = d.summaryByIso[iso];
  const lags = d.meta.lags;
  const isFull = version === "full";
  // The paper published only the peaks, so its view uses our 2020 curve with the paper's peak marked on it.
  const empty = lags.map(() => null);
  const taus = d.ccf[isFull ? "full" : "ours"][iso]?.[cat] ?? empty;
  const other = d.ccf[isFull ? "ours" : "full"][iso]?.[cat] ?? empty;
  const b = bestOf(s, version);
  const pub = s?.published;
  const published = version === "published" && pub && pub.lag[cat] !== null && pub.tau[cat] !== null
    ? { lag: pub.lag[cat] as number, tau: pub.tau[cat] as number } : null;
  const best = b?.lag[cat] ?? 0;
  const bestTau = b?.tau[cat] ?? null;
  const [lag, setLagRaw] = useState(best);
  const [flip, setFlip] = useState(true);
  useEffect(() => setLagRaw(best), [best, iso, cat]);
  // The peak acts like a station: within a day of it, the slider settles on it.
  const setLag = (l: number) => setLagRaw(Math.abs(l - best) <= 1 ? best : l);
  const shown = useTween(lag, 320);

  const start = parseDate(d.meta.start);
  const end = isFull ? d.panel.countries[iso].cases.length - 1 : dayDiff(start, parseDate(d.meta.paper_end));
  const tauHere = taus[lags.indexOf(lag)] ?? null;
  const tauShown = useTween(tauHere ?? 0, 320);
  const negative = (bestTau ?? 0) < 0;
  const info = CAT_BY_KEY[cat];

  // Cases shifted by the lag so that cases[t - lag] sits at t, as in the correlation.
  const aligned = useMemo(() => {
    const p = d.panel.countries[iso];
    const cases = p.cases.slice(0, end + 1);
    const shifted: Series = cases.map((_, t) => at(cases, t - shown));
    const mob = (isFull ? rolling7(p.mob[cat]) : p.mob[cat]).slice(0, end + 1);
    const zMob = zscore(mob).map((v) => (v === null ? null : flip && negative ? -v : v));
    return { cases: zscore(shifted), mob: zMob };
  }, [d.panel, iso, cat, shown, end, flip, negative, isFull]);

  return (
    <Section
      id="lag" n={3}
      title="Slide the lag until the curves line up"
      dek={<>The paper's core method: shift case numbers up to four weeks either way and measure how closely they track movement, using Kendall's τ. The lag where |τ| peaks shows <em>who moved first</em>.</>}
    >
      <div className="lag-control">
        <span className="filter-label">Lag</span>
        <div className="track">
          <input type="range" min={lags[0]} max={lags[lags.length - 1]} step={1} value={lag} onChange={(e) => setLag(Number(e.target.value))} aria-label="Lag in days" />
          <span className="peak-stop" style={{ left: `calc(${((best - lags[0]) / (lags[lags.length - 1] - lags[0])) * 100}% + ${8 - ((best - lags[0]) / (lags[lags.length - 1] - lags[0])) * 16}px)` }} title="Peak" />
        </div>
        <button className="line-chip" onClick={() => setLag(best)} style={{ ["--c" as string]: catVar(cat) }}>
          <span className="roundel" />Jump to peak
        </button>
      </div>
      <div className="readout">
        <div><div className="r-val">{tauHere === null ? "–" : fmtTau(tauShown)}</div><div className="r-label">Kendall's τ at this lag</div></div>
        <div><div className="r-val">{fmtLag(lag)}</div><div className="r-label">Movement {lagMeaning(lag)}</div></div>
        <div><div className="r-val">{fmtTau(bestTau)}</div><div className="r-label">Peak τ ({VERSION_BY_KEY[version].short}), at {fmtLag(best)}</div></div>
      </div>

      <div className="grid-2 panel">
        <div>
          <div className="panel-head"><span className="panel-title">τ at every lag · {c.name}, {info.label.toLowerCase()}</span></div>
          <LagCurve
            lags={lags} taus={taus} other={other} otherLabel={isFull ? "Ours · 2020" : "Ours · 2020–22"} published={published}
            lag={lag} shown={shown} setLag={setLag} color={catVar(cat)}
          />
          <p className="caption">
            Drag across the chart, or use the slider.{" "}
            {isFull
              ? "15 Feb 2020 – 16 Apr 2022, 7-day averages of both series."
              : "15 Feb – 19 Jun 2020, daily cases (unsmoothed, as in the paper)."}
            {version === "published" && !published ? ` ${c.name} isn't in the paper's tables, so there's no published peak.` : ""}
          </p>
        </div>
        <div>
          <div className="panel-head">
            <span className="panel-title">Cases shifted by {fmtLag(lag)} vs movement (standardised)</span>
            {negative && (
              <label className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> Flip movement
              </label>
            )}
          </div>
          <TimeChart
            ariaLabel="Shifted cases and mobility, both standardised"
            start={start} height={260} range={[0, end]}
            series={[
              { key: "cases", label: "Cases", color: "var(--ink)", values: aligned.cases },
              { key: "mob", label: flip && negative ? `${info.short} (flipped)` : info.short, color: catVar(cat), values: aligned.mob },
            ]}
            yFormat={(v) => v.toFixed(0)}
            valueFormat={(v) => (v === null ? "–" : `${v.toFixed(2)} sd`)}
            zero
          />
          <p className="caption">Both series are z-scores, which puts them on one axis instead of two.{negative ? " Movement is flipped so a negative link shows as overlapping curves." : ""}</p>
        </div>
      </div>
      {bestTau !== null && (
        <p className="insight">
          In {c.name}, {info.label.toLowerCase()} {negative ? "fell as cases rose" : "rose with cases"} (τ {fmtTau(bestTau)}), and the link
          was strongest with movement changing {lagMeaning(best)}.
        </p>
      )}
    </Section>
  );
}
