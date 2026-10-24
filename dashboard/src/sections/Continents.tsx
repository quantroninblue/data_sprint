import { scaleBand, scaleLinear } from "d3-scale";
import { useMemo, useState } from "react";
import { Beeswarm } from "../components/Beeswarm";
import { Section, Seg, TableView } from "../components/Chrome";
import { bestOf, type Cat, type Data, type Metric, type Version } from "../lib/data";
import { PAPER_LAG, PAPER_P, PAPER_TAU } from "../lib/paper";
import { CAT_BY_KEY, catVar, CONTINENT_ORDER, CONTINENT_SHORT, VERSION_BY_KEY, VERSIONS } from "../lib/theme";
import { fmtLag, fmtP, fmtTau, median, useWidth } from "../lib/util";
import type { Ctx } from "./ctx";

const EDGE = 27; // best lags at |lag| >= 27 sit at the edge of the ±28-day search

function lagsOf(d: Data, v: Version, cat: Cat) {
  return d.summary.map((s) => bestOf(s, v)?.lag[cat] ?? null).filter((x): x is number => x !== null);
}

function LagHistogram({ d, cat, version }: { d: Data; cat: Cat; version: Version }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const lags = d.meta.lags;
  const values = lagsOf(d, version, cat);
  const counts = lags.map((l) => values.filter((v) => v === l).length);
  const height = 220;
  const m = { top: 16, right: 12, bottom: 30, left: 34 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = height - m.top - m.bottom;
  const x = scaleBand<number>().domain(lags).range([0, iw]).paddingInner(0.15);
  const y = scaleLinear().domain([0, Math.max(5, ...counts)]).nice().range([ih, 0]);
  const bw = Math.min(24, x.bandwidth());
  const bar = (h: number, w: number) => (h <= 0 ? "" : `M0,${h} v${-(h - Math.min(4, h))} a${Math.min(4, w / 2)},${Math.min(4, h)} 0 0 1 ${Math.min(4, w / 2)},${-Math.min(4, h)} h${w - 2 * Math.min(4, w / 2)} a${Math.min(4, w / 2)},${Math.min(4, h)} 0 0 1 ${Math.min(4, w / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z`);
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Histogram of best lags">
          <g transform={`translate(${m.left},${m.top})`}>
            {y.ticks(4).map((t) => (
              <g key={t} className="tick" transform={`translate(0,${y(t)})`}><line x2={iw} /><text x={-6} dy="0.32em" textAnchor="end">{t}</text></g>
            ))}
            {lags.map((l, i) => {
              const h = ih - y(counts[i]);
              const edge = Math.abs(l) >= EDGE;
              return (
                <g key={l} transform={`translate(${(x(l) ?? 0) + (x.bandwidth() - bw) / 2},${ih - h})`} onPointerEnter={() => setHover(l)} onPointerLeave={() => setHover(null)}>
                  <rect x={-2} y={-(ih - h)} width={bw + 4} height={ih} fill="transparent" />
                  <path d={bar(h, bw)} fill={edge ? "var(--ink)" : catVar(cat)} opacity={hover === null || hover === l ? 1 : 0.6} />
                </g>
              );
            })}
            <line className="baseline" x2={iw} y1={ih} y2={ih} />
            {[-28, -14, 0, 14, 28].map((t) => (
              <text key={t} className="tick" x={(x(t) ?? 0) + x.bandwidth() / 2} y={ih + 18} textAnchor="middle"><tspan className="annot">{t === 0 ? "0" : fmtLag(t)}</tspan></text>
            ))}
          </g>
        </svg>
      )}
      {hover !== null && (
        <div className="tooltip" style={{ left: m.left + (x(hover) ?? 0), top: m.top + y(counts[lags.indexOf(hover)]) }}>
          <div className="t-row"><span className="t-val">{counts[lags.indexOf(hover)]}</span><span>countries with best lag {fmtLag(hover)}</span></div>
        </div>
      )}
    </div>
  );
}

export function Continents({ d, iso, setIso, cat, version, metric, setMetric }: Ctx & { metric: Metric; setMetric: (m: Metric) => void }) {
  const info = CAT_BY_KEY[cat];
  const fmt = metric === "tau" ? fmtTau : fmtLag;
  const paper = metric === "tau" ? PAPER_TAU[cat] : PAPER_LAG[cat];
  const test = version === "published" ? null : d.tests[version][cat][metric];
  const points = d.summary
    .map((s) => ({ s, v: bestOf(s, version)?.[metric][cat] ?? null }))
    .filter((p): p is { s: typeof p.s; v: number } => p.v !== null)
    .map(({ s, v }) => ({ iso2: s.iso2, name: d.byIso[s.iso2].name, continent: s.continent, value: v }));
  const sig = test ? test.dunn.filter((p) => p.p_adj < 0.05).sort((a, b) => a.p_adj - b.p_adj) : [];

  const edgeShare = useMemo(
    () => Object.fromEntries(VERSIONS.map((v) => {
      const l = lagsOf(d, v.key, cat);
      return [v.key, l.length ? Math.round((100 * l.filter((x) => Math.abs(x) >= EDGE).length) / l.length) : 0];
    })) as Record<Version, number>,
    [d, cat],
  );

  // Continent medians per version: the paper's Tables 1-2, and ours computed from the same country values.
  const medianFor = (v: Version, c: (typeof CONTINENT_ORDER)[number]) => {
    if (v === "published") return paper[c];
    const t = d.tests[v][cat][metric].medians[c];
    if (t !== undefined) return t;
    const vals = points.filter((p) => p.continent === c).map((p) => p.value);
    return vals.length ? median(vals) : null;
  };

  return (
    <Section
      id="continents" n={5}
      title="Continents behaved differently, and South America ran the other way"
      dek="Each dot is a country. The dark bar marks the continent median and the shaded block the middle half of countries. This is the paper's boxplots and Tables 1–2 in one view, with our numbers beside theirs."
    >
      <div className="panel-head panel">
        <Seg label="Metric" value={metric} onChange={setMetric} options={[{ value: "tau", label: "Strength (τ)" }, { value: "lag", label: "Lag (days)" }]} />
        <span className="panel-sub">
          {test
            ? <>Kruskal–Wallis H = {test.kw_h.toFixed(1)}, {fmtP(test.kw_p)} · {info.label} · {VERSION_BY_KEY[version].label}</>
            : <>Paper's reported adjusted {fmtP(PAPER_P[metric][cat])} · {info.label}</>}
        </span>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <Beeswarm
          ariaLabel={`${metric === "tau" ? "Kendall's tau" : "Lag"} by continent for ${info.label}`}
          points={points}
          domain={metric === "tau" ? [-1, 1] : [-28, 28]}
          format={fmt}
          color={catVar(cat)}
          selected={iso}
          onSelect={setIso}
        />
        <div>
          <div className="panel-title" style={{ marginBottom: 6 }}>Paper vs ours · continent medians</div>
          <table className="data">
            <thead>
              <tr><th>Continent</th>{VERSIONS.map((v) => <th key={v.key} className="num" style={{ color: v.key === version ? "var(--ink)" : undefined }}>{v.short}</th>)}</tr>
            </thead>
            <tbody>
              {CONTINENT_ORDER.map((c) => (
                <tr key={c}>
                  <td>{CONTINENT_SHORT[c]}</td>
                  {VERSIONS.map((v) => <td key={v.key} className="num">{fmt(medianFor(v.key, c))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">The paper's Tables 1–2 against our replication. Our 2020 medians match the paper's to within about 0.02.</p>
          {test && (
            <>
              <div className="panel-title" style={{ margin: "14px 0 6px" }}>Significant pairs (Dunn, Holm-adjusted)</div>
              {sig.length ? (
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {sig.slice(0, 6).map((p) => (
                    <li key={p.a + p.b}>{CONTINENT_SHORT[p.a]} vs {CONTINENT_SHORT[p.b]} · {fmtP(p.p_adj)}</li>
                  ))}
                </ul>
              ) : <p className="small">No pair differs at p &lt; 0.05.</p>}
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Where the "best" lags land · {info.label.toLowerCase()}, {VERSION_BY_KEY[version].label}</span>
          <span className="panel-sub">
            At the ±27–28 day edge: {VERSIONS.map((v) => `${v.short} ${edgeShare[v.key]}%`).join(" · ")} (about 7% expected by chance)
          </span>
        </div>
        <LagHistogram d={d} cat={cat} version={version} />
        <p className="caption">
          Dark bars mark the edge of the search window. A pile-up there usually means the method was still searching when it hit the
          limit, because both series trend together, rather than a real four-week delay.
        </p>
      </div>

      <TableView label="Show table: every country in this view">
        <table className="data">
          <thead><tr><th>Country</th><th>Continent</th><th className="num">{metric === "tau" ? "τ" : "Lag"}</th></tr></thead>
          <tbody>
            {[...points].sort((a, b) => a.continent.localeCompare(b.continent) || a.value - b.value).map((p) => (
              <tr key={p.iso2}><td>{p.name}</td><td>{CONTINENT_SHORT[p.continent]}</td><td className="num">{fmt(p.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </Section>
  );
}
