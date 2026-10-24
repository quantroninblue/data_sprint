import { scaleLinear } from "d3-scale";
import { useMemo, useState } from "react";
import { Section } from "../components/Chrome";
import { WorldMap } from "../components/WorldMap";
import { CAT_BY_KEY, catVar, CLUSTER_NAMES, noDataColor } from "../lib/theme";
import { fmtLag, fmtTau, useWidth } from "../lib/util";
import type { Ctx } from "./ctx";

const M = { top: 12, right: 16, bottom: 36, left: 44 };

export function Clusters({ d, iso, setIso, cat, mode }: Ctx) {
  const [pinned, setPinned] = useState<number | null>(null);
  const [peek, setPeek] = useState<number | null>(null);
  const active = peek ?? pinned;
  const [hover, setHover] = useState<string | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const numericToIso = useMemo(() => Object.fromEntries(d.meta.countries.map((c) => [c.numeric, c.iso2])), [d.meta.countries]);
  const members = useMemo(() => Object.fromEntries(d.meta.clusters.map((c) => [c.id, new Set(c.members)])), [d.meta.clusters]);
  const focus = active ? members[active] : null;
  const info = CAT_BY_KEY[cat];

  const height = 340;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const x = scaleLinear().domain([-28, 28]).range([0, innerW]);
  const y = scaleLinear().domain([-1, 1]).range([innerH, 0]);
  const pts = d.summary.filter((s) => s.tau[cat] !== null && s.lag[cat] !== null);
  const hovered = hover ? d.summaryByIso[hover] : null;

  return (
    <Section
      id="clusters" n={6}
      title="Four ways countries rode the first wave"
      dek="Grouping countries by the strength and timing of all six links gives four families. The paper only describes them in its text, so this view is new."
    >
      <div className="cluster-cards">
        {d.meta.clusters.map((c) => (
          <button
            key={c.id} className="cluster-card" aria-pressed={pinned === c.id}
            onClick={() => setPinned(pinned === c.id ? null : c.id)}
            onPointerEnter={() => setPeek(c.id)}
            onPointerLeave={() => setPeek(null)}
          >
            <div className="cc-n">Cluster {c.id} · {c.n} countries</div>
            <div className="cc-name">{CLUSTER_NAMES[c.id]?.name}</div>
            <WorldMap
              compact ariaLabel={`Countries in cluster ${c.id}`} numericToIso={numericToIso}
              fill={(i) => (i && members[c.id].has(i) ? "var(--ink)" : noDataColor(mode))}
            />
            <div className="cc-stats">Median τ {fmtTau(c.median_tau)} · lag {fmtLag(c.median_lag)}</div>
            <div className="small" style={{ marginTop: 4 }}>{CLUSTER_NAMES[c.id]?.blurb}</div>
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Strength against timing · {info.label.toLowerCase()}</span>
          <span className="panel-sub">{active ? `Highlighting ${CLUSTER_NAMES[active]?.name}` : "Hover or click a cluster card to highlight it"}</span>
        </div>
        <div className="chart" ref={ref} style={{ height }}>
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label="Scatter of tau against lag">
              <g transform={`translate(${M.left},${M.top})`}>
                {[-1, -0.5, 0, 0.5, 1].map((t) => (
                  <g key={t} className="tick" transform={`translate(0,${y(t)})`}><line x2={innerW} /><text x={-8} dy="0.32em" textAnchor="end">{fmtTau(t)}</text></g>
                ))}
                {[-28, -14, 0, 14, 28].map((t) => (
                  <g key={t} className="tick" transform={`translate(${x(t)},0)`}><line y2={innerH} /><text y={innerH + 18} textAnchor="middle">{t === 0 ? "0" : fmtLag(t)}</text></g>
                ))}
                <line className="baseline" x2={innerW} y1={y(0)} y2={y(0)} />
                <text x={0} y={innerH + 34} className="annot">← movement first</text>
                <text x={innerW} y={innerH + 34} className="annot" textAnchor="end">cases first →</text>
                {pts.map((s) => {
                  const on = !focus || focus.has(s.iso2);
                  const sel = s.iso2 === iso;
                  return (
                    <g key={s.iso2} style={{ cursor: "pointer" }} onPointerEnter={() => setHover(s.iso2)} onPointerLeave={() => setHover(null)} onClick={() => setIso(s.iso2)}>
                      <circle cx={x(s.lag[cat] as number)} cy={y(s.tau[cat] as number)} r={12} fill="transparent" />
                      <circle
                        cx={x(s.lag[cat] as number)} cy={y(s.tau[cat] as number)} r={sel ? 6.5 : 4.5}
                        fill={sel ? "var(--ink)" : on ? catVar(cat) : "var(--axis)"} opacity={on ? 0.9 : 0.35}
                        stroke="var(--ring)" strokeWidth={2} style={{ transition: "fill 0.25s, opacity 0.25s" }}
                      />
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
          {hovered && (
            <div className="tooltip" style={{ left: M.left + x(hovered.lag[cat] as number), top: M.top + y(hovered.tau[cat] as number) }}>
              <div className="t-head">{d.byIso[hovered.iso2].name}</div>
              <div className="t-row"><span className="t-val">{fmtTau(hovered.tau[cat])}</span><span>τ</span></div>
              <div className="t-row"><span className="t-val">{fmtLag(hovered.lag[cat])}</span><span>lag</span></div>
              {hovered.cluster && <div className="t-row"><span>{CLUSTER_NAMES[hovered.cluster]?.name}</span></div>}
            </div>
          )}
        </div>
        <p className="caption">Preliminary: k-means on scaled τ and lag across all six lines. The final analysis will use mclust, as the paper did.</p>
      </div>
    </Section>
  );
}
