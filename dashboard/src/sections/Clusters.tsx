import { scaleLinear } from "d3-scale";
import { useMemo, useState } from "react";
import { Section } from "../components/Chrome";
import { WorldMap } from "../components/WorldMap";
import { bestOf, type ClusterType } from "../lib/data";
import { CAT_BY_KEY, catVar, CLUSTER_NAMES, CLUSTER_ORDER, noDataColor, VERSION_BY_KEY } from "../lib/theme";
import { line } from "d3-shape";
import { fmtLag, fmtPct, fmtTau, median, useWidth } from "../lib/util";
import type { Ctx } from "./ctx";

const M = { top: 12, right: 16, bottom: 36, left: 44 };

/** One small multiple: every member's weekly curve faintly, the style's average boldly. */
function StyleCurves({ curves, color, label }: { curves: (number | null)[][]; color: string; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const h = 130, m = { top: 6, right: 6, bottom: 18, left: 34 };
  const iw = Math.max(0, width - m.left - m.right), ih = h - m.top - m.bottom;
  const n = curves[0]?.length ?? 0;
  const x = scaleLinear().domain([0, Math.max(1, n - 1)]).range([0, iw]);
  const y = scaleLinear().domain([-90, 30]).range([ih, 0]);
  const path = line<number | null>().defined((v) => v !== null).x((_, i) => x(i)).y((v) => y(v as number));
  const mean = Array.from({ length: n }, (_, i) => {
    const v = curves.map((c) => c[i]).filter((q): q is number => q !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  });
  return (
    <div className="chart" ref={ref} style={{ height: h }}>
      {width > 0 && (
        <svg width={width} height={h} role="img" aria-label={`Weekly mobility curves, ${label}`}>
          <g transform={`translate(${m.left},${m.top})`}>
            {[-80, -40, 0].map((t) => (
              <g key={t} className="tick" transform={`translate(0,${y(t)})`}>
                <line x2={iw} className={t === 0 ? "baseline" : undefined} /><text x={-6} dy="0.32em" textAnchor="end">{fmtPct(t)}</text>
              </g>
            ))}
            {curves.map((c, k) => <path key={k} d={path(c) ?? ""} fill="none" stroke="var(--ink-2)" strokeWidth={1} opacity={0.18} />)}
            <path d={path(mean) ?? ""} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" />
            <text x={0} y={ih + 14} className="annot">Feb</text>
            <text x={iw} y={ih + 14} className="annot" textAnchor="end">Jun</text>
          </g>
        </svg>
      )}
    </div>
  );
}

function LockdownStyles({ d, mode, iso, setIso }: Pick<Ctx, "d" | "mode" | "iso" | "setIso">) {
  const c = d.context!;
  const numericToIso = useMemo(() => Object.fromEntries(d.meta.countries.map((k) => [k.numeric, k.iso2])), [d.meta.countries]);
  // deepest first; ordinal ramp runs from the mildest (1) to the deepest (4)
  const order = c.style_order;
  const color = (style: string) => `var(--ord-${4 - order.indexOf(style)})`;
  const byIso = Object.fromEntries(c.styles.map((s) => [s.iso2, s.style]));
  const deepest = (style: string) => {
    const v = c.styles.filter((s) => s.style === style).map((s) => Math.min(...s.weekly.filter((q): q is number => q !== null)));
    return v.length ? median(v) : null;
  };
  // how often the two groupings agree: share of "In step" countries that were also a deep or strong lockdown
  const instep = d.summary.filter((s) => s.cluster.corrected === "instep" && byIso[s.iso2]);
  const deepInStep = instep.filter((s) => ["Deep lockdown", "Strong drop"].includes(byIso[s.iso2])).length;
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">A different grouping: lockdown styles, from the shape of each country's mobility curve</span>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
        <div>
          <WorldMap
            ariaLabel="Map of lockdown styles"
            numericToIso={numericToIso}
            fill={(i) => (i && byIso[i] ? color(byIso[i]) : noDataColor(mode))}
            selected={iso} onSelect={setIso}
            tooltip={(i, name) => <><div className="t-head">{i ? d.byIso[i]?.name ?? name : name}</div><div>{i && byIso[i] ? byIso[i] : "Not grouped"}</div></>}
          />
          <div className="legend">
            {order.map((s) => <span key={s}><i style={{ background: color(s), width: 10, height: 10, borderRadius: 2 }} />{s}</span>)}
          </div>
        </div>
        <div className="multiples" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {order.map((s) => {
            const members = c.styles.filter((k) => k.style === s);
            return (
              <div key={s}>
                <div className="panel-title" style={{ fontSize: 13 }}>{s}</div>
                <div className="small">{members.length} countries · median low point {fmtPct(deepest(s))}</div>
                <StyleCurves curves={members.map((k) => k.weekly)} color={color(s)} label={s} />
              </div>
            );
          })}
        </div>
      </div>
      <p className="caption">
        k-means on each country's weekly mobility index, 15 Feb – 19 Jun 2020, named by the depth of the drop. Unlike the τ/lag
        clusters, this grouping doesn't depend on the lag search, so none of its groups can be an edge artefact.
      </p>
      <div className="differs">
        <strong>How the two groupings compare.</strong> The τ/lag clusters sort countries by how their correlation behaved; these sort
        them by what people actually did. {instep.length > 0 && <>Of the {instep.length} "In step" countries, {deepInStep} had a deep or
        strong lockdown.</>} Two of the four τ/lag clusters sit at the ±28-day edge, which this grouping avoids.
      </div>
    </div>
  );
}

export function Clusters({ d, iso, setIso, cat, mode, version }: Ctx) {
  const [pinned, setPinned] = useState<ClusterType | null>(null);
  const [peek, setPeek] = useState<ClusterType | null>(null);
  const active = peek ?? pinned;
  const [hover, setHover] = useState<string | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const numericToIso = useMemo(() => Object.fromEntries(d.meta.countries.map((c) => [c.numeric, c.iso2])), [d.meta.countries]);

  // Clusters exist for the paper and for our 2020 run; the full period has none, so it shows our 2020 clusters.
  const usePaper = version === "published";
  const typeOf = (i: string) => (usePaper ? d.summaryByIso[i]?.cluster.published : d.summaryByIso[i]?.cluster.corrected) ?? null;
  const members = useMemo(() => {
    const out: Record<ClusterType, Set<string>> = { instep: new Set(), loose: new Set(), early: new Set(), opposite: new Set() };
    for (const s of d.summary) {
      const t = usePaper ? s.cluster.published : s.cluster.corrected;
      if (t) out[t].add(s.iso2);
    }
    return out;
  }, [d.summary, usePaper]);
  const profile = (set: "published" | "replication" | "corrected", t: ClusterType) => d.meta.clusters[set].find((c) => c.type === t);
  const focus = active ? members[active] : null;
  const info = CAT_BY_KEY[cat];
  const scatterVersion = version === "full" ? "ours" : version;

  const height = 340;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const x = scaleLinear().domain([-28, 28]).range([0, innerW]);
  const y = scaleLinear().domain([-1, 1]).range([innerH, 0]);
  const pts = d.summary
    .map((s) => ({ s, b: bestOf(s, scatterVersion) }))
    .filter(({ b }) => b && b.tau[cat] !== null && b.lag[cat] !== null)
    .map(({ s, b }) => ({ iso2: s.iso2, tau: b!.tau[cat] as number, lag: b!.lag[cat] as number }));
  const hovered = hover ? pts.find((p) => p.iso2 === hover) : null;

  return (
    <Section
      id="clusters" n={7}
      title="The same four families of countries, in the paper and in ours"
      dek={<>Grouping countries by the strength and timing of all six links gives four families, both in the paper and in our replication. Showing <em>{usePaper ? "the paper's clusters" : "our clusters (2020)"}</em>. Two of the four sit at the ±28-day edge of the search.</>}
    >
      <div className="cluster-cards">
        {CLUSTER_ORDER.map((t) => {
          const shown = profile(usePaper ? "published" : "corrected", t);
          return (
            <button
              key={t} className="cluster-card" aria-pressed={pinned === t}
              onClick={() => setPinned(pinned === t ? null : t)}
              onPointerEnter={() => setPeek(t)}
              onPointerLeave={() => setPeek(null)}
            >
              <div className="cc-n">
                Paper {profile("published", t)?.n ?? "–"} · code re-run {profile("replication", t)?.n ?? "–"} · ours {profile("corrected", t)?.n ?? "–"}
              </div>
              <div className="cc-name">{CLUSTER_NAMES[t].name}</div>
              <WorldMap
                compact ariaLabel={`Countries in the ${CLUSTER_NAMES[t].name} cluster`} numericToIso={numericToIso}
                fill={(i) => (i && members[t].has(i) ? "var(--ink)" : noDataColor(mode))}
              />
              {shown && <div className="cc-stats">Median τ {fmtTau(shown.median_tau)} · lag {fmtLag(shown.median_lag)}</div>}
              <div className="small" style={{ marginTop: 4 }}>{CLUSTER_NAMES[t].blurb}</div>
            </button>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Strength against timing · {info.label.toLowerCase()}, {VERSION_BY_KEY[scatterVersion].label}</span>
          <span className="panel-sub">{active ? `Highlighting ${CLUSTER_NAMES[active].name}` : "Hover or click a cluster card to highlight it"}</span>
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
                {pts.map((p) => {
                  const on = !focus || focus.has(p.iso2);
                  const sel = p.iso2 === iso;
                  return (
                    <g key={p.iso2} style={{ cursor: "pointer" }} onPointerEnter={() => setHover(p.iso2)} onPointerLeave={() => setHover(null)} onClick={() => setIso(p.iso2)}>
                      <circle cx={x(p.lag)} cy={y(p.tau)} r={12} fill="transparent" />
                      <circle
                        cx={x(p.lag)} cy={y(p.tau)} r={sel ? 6.5 : 4.5}
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
            <div className="tooltip" style={{ left: M.left + x(hovered.lag), top: M.top + y(hovered.tau) }}>
              <div className="t-head">{d.byIso[hovered.iso2].name}</div>
              <div className="t-row"><span className="t-val">{fmtTau(hovered.tau)}</span><span>τ</span></div>
              <div className="t-row"><span className="t-val">{fmtLag(hovered.lag)}</span><span>lag</span></div>
              {typeOf(hovered.iso2) && <div className="t-row"><span>{CLUSTER_NAMES[typeOf(hovered.iso2) as ClusterType].name}</span></div>}
            </div>
          )}
        </div>
        <p className="caption">
          Clusters from mclust on τ and lag across all six lines: the paper's from its supplementary table, ours from our replication.
          They're matched across versions by profile, since the cluster numbers differ.{version === "full" ? " No clusters were computed for 2020–22, so this shows 2020." : ""}
        </p>
      </div>
      {d.context && d.context.styles.length > 0 && <LockdownStyles d={d} mode={mode} iso={iso} setIso={setIso} />}
    </Section>
  );
}
