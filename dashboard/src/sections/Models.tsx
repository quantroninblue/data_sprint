import { scaleLinear } from "d3-scale";
import { useState } from "react";
import { BandChart } from "../components/BandChart";
import { Section, Seg } from "../components/Chrome";
import type { ModelKey, ModelVersion } from "../lib/data";
import { MODEL_LABELS, PAPER_TABLE3 } from "../lib/paper";
import { CAT_BY_KEY } from "../lib/theme";
import type { Cat } from "../lib/data";
import { fmtNum, useWidth } from "../lib/util";
import type { Ctx } from "./ctx";

const KEYS: ModelKey[] = ["date", "mobility", "lagged"];
const MODEL_VERSIONS: { key: ModelVersion; label: string; note: string }[] = [
  { key: "paper", label: "Paper", note: "as published" },
  { key: "replication", label: "Authors' code, re-run", note: "same code, our data" },
  { key: "corrected", label: "Ours, corrected", note: "coding errors fixed, 134 countries" },
];

/** Horizontal bars from zero; the lowest value is the best model. */
function Bars({ values, max, format, label }: { values: Record<ModelKey, number>; max: number; format: (v: number) => string; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const best = KEYS.reduce((a, b) => (values[a] <= values[b] ? a : b));
  const labelW = Math.min(150, width * 0.42);
  const innerW = Math.max(0, width - labelW - 84);
  const x = scaleLinear().domain([0, max]).range([0, innerW]);
  const rowH = 30;
  return (
    <div className="chart" ref={ref} style={{ height: rowH * 3 }}>
      {width > 0 && (
        <svg width={width} height={rowH * 3} role="img" aria-label={label}>
          {KEYS.map((k, i) => {
            const w = Math.max(2, x(values[k]));
            return (
              <g key={k} transform={`translate(0,${i * rowH})`}>
                <text x={0} y={rowH / 2} dy="0.32em" className="direct-label">{MODEL_LABELS[k]}</text>
                <path d={`M${labelW},${rowH / 2 - 8} h${Math.max(0, w - 4)} a4,4 0 0 1 4,4 v8 a4,4 0 0 1 -4,4 h${-Math.max(0, w - 4)} z`} fill={k === best ? "var(--accent)" : "var(--axis)"} />
                <text x={labelW + w + 8} y={rowH / 2} dy="0.32em" className={k === best ? "annot-strong" : "annot"}>
                  {format(values[k])}{k === best ? " · best" : ""}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** The paper's Table 3 against the same model re-run with the authors' code. */
function Coefficients({ rows }: { rows: { term: string; paper?: { estimate: number; se: number; p: number }; rerun?: { estimate: number; se: number; p: number } }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const labelW = 150;
  const innerW = Math.max(0, width - labelW - 20);
  const x = scaleLinear().domain([-3, 1.4]).range([0, innerW]);
  const rowH = 40;
  const h = rowH * rows.length + 28;
  const mark = (e: { estimate: number; se: number; p: number }, cy: number, color: string, hollow: boolean) => (
    <g>
      <line x1={x(e.estimate - 1.96 * e.se)} x2={x(e.estimate + 1.96 * e.se)} y1={cy} y2={cy} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <circle cx={x(e.estimate)} cy={cy} r={5} fill={hollow ? "var(--surface)" : color} stroke={hollow ? color : "var(--ring)"} strokeWidth={2} />
      <text x={x(e.estimate + 1.96 * e.se) + 8} y={cy} dy="0.32em" className={e.p < 0.05 ? "annot-strong" : "annot"}>
        {e.estimate.toFixed(2)}{e.p < 0.05 ? ` · p = ${e.p.toFixed(3)}` : ""}
      </text>
    </g>
  );
  return (
    <div className="chart" ref={ref} style={{ height: h }}>
      {width > 0 && (
        <svg width={width} height={h} role="img" aria-label="Model coefficients with 95% intervals, paper against re-run">
          <g transform={`translate(${labelW},0)`}>
            {[-3, -2, -1, 0, 1].map((t) => (
              <g key={t} className="tick" transform={`translate(${x(t)},0)`}>
                <line y2={rowH * rows.length} />
                <text y={rowH * rows.length + 16} textAnchor="middle">{t}</text>
              </g>
            ))}
            <line x1={x(0)} x2={x(0)} y2={rowH * rows.length} className="baseline" />
          </g>
          {rows.map((r, i) => {
            const cy = i * rowH + rowH / 2;
            return (
              <g key={r.term}>
                <text x={0} y={cy} dy="0.32em" className="direct-label">{CAT_BY_KEY[r.term as Cat]?.label ?? r.term}</text>
                <g transform={`translate(${labelW},0)`}>
                  {r.paper && mark(r.paper, cy - 8, "var(--ink-2)", true)}
                  {r.rerun && mark(r.rerun, cy + 8, "var(--accent)", false)}
                </g>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

const pctGrowth = (b: number) => (Math.exp(b) - 1) * 100;
const fmtPctGrowth = (b: number) => `${pctGrowth(b) >= 0 ? "+" : "−"}${Math.abs(pctGrowth(b)).toFixed(0)}%`;

function LocalProjections({ d, cat }: { d: Ctx["d"]; cat: Cat }) {
  const [x, setX] = useState<"index" | "line">("index");
  const key = x === "line" && d.fair.lp.main.transmission[cat] ? cat : "index";
  const lp = d.fair.lp;
  const peakOf = (pts: { h: number; beta: number }[]) => pts.reduce((a, b) => (Math.abs(b.beta) > Math.abs(a.beta) ? b : a));
  const main = lp.main.transmission[key];
  const ext = lp.ext.transmission[key];
  const pm = peakOf(main), pe = peakOf(ext);
  const toPts = (p: { h: number; beta: number; lo: number; hi: number }[]) => p.map((q) => ({ x: q.h, v: q.beta, lo: q.lo, hi: q.hi }));
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">A better model: how 1 SD more mobility changes weekly case growth, 0–28 days later</span>
        <Seg label="Mobility measure" value={x} onChange={setX} options={[{ value: "index", label: "Mobility index" }, { value: "line", label: `Selected line (${CAT_BY_KEY[cat].short})` }]} />
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <BandChart
          ariaLabel="Effect of mobility on case growth by horizon, two periods"
          series={[
            { key: "main", label: "Feb–Jun 2020", color: "var(--accent)", points: toPts(main) },
            { key: "ext", label: "Sep 2020 – Apr 2022", color: "var(--muted)", points: toPts(ext) },
          ]}
          xDomain={[0, 28]} xTicks={[0, 7, 14, 21, 28]} xFormat={(v) => `${v} d`}
          yFormat={(v) => v.toFixed(2)} valueFormat={(v) => `${v.toFixed(3)} (${fmtPctGrowth(v)})`}
          shade={{ from: 0, to: 9, label: "too soon to show in reports" }} height={260}
        />
        <div className="readout" style={{ alignContent: "start" }}>
          <div><div className="r-val">{fmtPctGrowth(pm.beta)}</div><div className="r-label">faster weekly growth {pm.h} days later, 2020</div></div>
          <div><div className="r-val">{fmtPctGrowth(pe.beta)}</div><div className="r-label">at {pe.h} days, Sep 2020 – Apr 2022</div></div>
        </div>
      </div>
      <p className="caption">
        One regression per horizon with country and day effects and controls for recent growth and mobility (local projections), 95%
        bands, errors clustered by country{key !== cat && x === "line" ? `. Parks wasn't modelled, so this shows the index` : ""}. The
        effect is zero for the first days, as it should be, since infections take that long to be reported.
      </p>
      <div className="differs">
        <strong>How this differs from the raw correlation over time.</strong> Over 2020–22 the paper's raw correlation all but vanishes
        and often flips sign. Measured this way, the link doesn't vanish: after September 2020 it is about half as strong and arrives
        later. So "the link disappeared" overstates it; "the link weakened" is what both results support.
      </div>
    </div>
  );
}

function RealTimeForecasts({ d }: { d: Ctx["d"] }) {
  const f = d.fair.forecast;
  const names = Object.keys(f.scores);
  const max = Math.max(...names.map((n) => f.scores[n].test));
  const chosen = "M2b mobility change";
  const h14 = f.horizons.find((r) => r.h === 14);
  return (
    <div className="panel">
      <div className="panel-title" style={{ marginBottom: 6 }}>A fair forecasting test: real-time 14-day forecasts, 20 Jun – 8 Sep 2020</div>
      <div className="grid-2" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
        <table className="data">
          <thead><tr><th>Model</th><th className="num">Error (mean abs. log)</th><th></th></tr></thead>
          <tbody>
            {names.map((n) => (
              <tr key={n} style={{ fontWeight: n === chosen ? 600 : 400 }}>
                <td>{n.replace(/^M\d\w?\s/, "")}{n === chosen ? " · chosen in advance" : ""}</td>
                <td className="num">{f.scores[n].test.toFixed(3)}</td>
                <td style={{ width: "40%" }}>
                  <div style={{ height: 8, borderRadius: 4, background: n === chosen ? "var(--accent)" : "var(--axis)", width: `${(f.scores[n].test / max) * 100}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="prose" style={{ margin: 0, fontSize: 14 }}>
          Each forecast uses only what was known on the day it was made, every country counts equally, and the mobility version was
          chosen on May–June data before the test period. Recent case growth ("momentum") beats a no-change forecast, but adding
          mobility doesn't beat momentum{h14 ? ` (p = ${h14.dm_p.toFixed(2)} at 14 days)` : ""}. Mobility's effect is already visible in
          recent case growth by the time you forecast.
        </p>
      </div>
      <div className="differs">
        <strong>Two ways of testing forecasts disagree on how much mobility hurts.</strong> The corrected version of the paper's models
        makes forecasts much worse with mobility (pooled error {fmtNum(d.models.rmse.date.corrected, 0)} →{" "}
        {fmtNum(d.models.rmse.lagged.corrected, 0)}), because those models extrapolate a date trend and use
        the actual future mobility. The real-time test finds no difference either way. Both agree on the main point: mobility adds no
        forecasting value. The paper found the opposite.
      </div>
    </div>
  );
}

export function Models({ d, cat }: Ctx) {
  const m = d.models;
  const rmseMax = Math.max(...KEYS.flatMap((k) => MODEL_VERSIONS.map((v) => m.rmse[k][v.key])));
  const coefRows = PAPER_TABLE3.map((p) => ({
    term: p.term,
    paper: p,
    rerun: m.table3_replication.find((r) => r.term === p.term),
  }));
  const dm = (version: string) => m.diebold_mariano.filter((r) => r.version === version);

  return (
    <Section
      id="models" n={8}
      title="Once the code is fixed, adding mobility makes forecasts worse"
      dek="The paper fits three mixed-effects GAMs (date only, plus same-day mobility, plus mobility over the previous two weeks), trains them to 19 June 2020 and tests them on the next 11 weeks. It found mobility helped. We re-ran the authors' code, then fixed its errors."
    >
      <div className="callout panel">
        <div className="callout-fig">625,000</div>
        <div>
          <div className="callout-text">cases a day: what the corrected mobility model predicted for the US in summer 2020, against a real peak of 75,147.</div>
          <div className="small">When mobility recovered after the first lockdowns, the models read it as runaway growth. Mobility was standing in for time.</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Forecast error, 20 Jun – 8 Sep 2020 · RMSE in cases per day (lower is better)</span>
          <span className="panel-sub">Same scale in all three panels</span>
        </div>
        <div className="multiples">
          {MODEL_VERSIONS.map((v) => (
            <div key={v.key}>
              <div className="panel-title" style={{ fontSize: 13 }}>{v.label}</div>
              <div className="small" style={{ marginBottom: 4 }}>{v.note}</div>
              <Bars label={`RMSE, ${v.label}`} max={rmseMax} format={(x) => fmtNum(x, 0)}
                values={Object.fromEntries(KEYS.map((k) => [k, m.rmse[k][v.key]])) as Record<ModelKey, number>} />
            </div>
          ))}
        </div>
        <p className="caption">
          The paper's ranking reverses. In our corrected run the date-only model forecasts best, and the typical country agrees: median
          per-country error is {KEYS.map((k) => `${fmtNum(m.median_country_rmse_per_million[k], 1)}`).join(" / ")} cases per million for
          date only / same-day / lagged.
        </p>
      </div>

      <div className="grid-2 panel">
        <div>
          <div className="panel-title" style={{ marginBottom: 8 }}>In-sample fit · BIC (lower is better)</div>
          <table className="data">
            <thead><tr><th>Model</th>{MODEL_VERSIONS.map((v) => <th key={v.key} className="num">{v.label}</th>)}</tr></thead>
            <tbody>
              {KEYS.map((k) => (
                <tr key={k}>
                  <td>{MODEL_LABELS[k]}</td>
                  {MODEL_VERSIONS.map((v) => {
                    const best = KEYS.every((o) => m.bic[k][v.key] <= m.bic[o][v.key]);
                    return <td key={v.key} className="num" style={{ fontWeight: best ? 600 : 400 }}>{fmtNum(m.bic[k][v.key], 0)}{best ? " ✓" : ""}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">BIC only compares models within a column, since each column uses a different sample.</p>

          <div className="panel-title" style={{ margin: "18px 0 8px" }}>Are the forecast differences significant? · Diebold–Mariano</div>
          <table className="data">
            <thead><tr><th>Comparison</th><th className="num">Authors' code</th><th className="num">Corrected</th></tr></thead>
            <tbody>
              {dm("as_published").map((r, i) => (
                <tr key={r.comparison}>
                  <td>{r.comparison}</td>
                  <td className="num">{r.statistic.toFixed(1)}</td>
                  <td className="num">{dm("corrected")[i]?.statistic.toFixed(1) ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">All p &lt; 0.001. With thousands of pooled, autocorrelated errors almost any gap tests as significant, so read these with care.</p>
        </div>
        <div>
          <div className="panel-title" style={{ marginBottom: 8 }}>Same-day model coefficients, 95% CI · paper vs authors' code re-run</div>
          <Coefficients rows={coefRows} />
          <div className="legend">
            <span><i style={{ width: 10, height: 10, borderRadius: 5, border: "2px solid var(--ink-2)", background: "none" }} />Paper (Table 3)</span>
            <span><i style={{ width: 10, height: 10, borderRadius: 5, background: "var(--accent)" }} />Authors' code, re-run</span>
          </div>
          <p className="caption">
            In both, only retail &amp; recreation is clearly significant. The corrected model fits every category as a smooth curve (all
            p &lt; 0.001), so it has no single coefficient to plot. It also adds residential, which the authors' formula silently dropped.
          </p>
        </div>
      </div>

      <LocalProjections d={d} cat={cat} />
      <RealTimeForecasts d={d} />

      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 8 }}>Paper vs ours at a glance</div>
        <table className="data">
          <thead><tr><th></th>{MODEL_VERSIONS.map((v) => <th key={v.key}>{v.label}</th>)}</tr></thead>
          <tbody>
            {m.paper_vs_replication.map((r) => (
              <tr key={r.item}><td style={{ fontWeight: 600 }}>{r.item}</td><td>{r.paper}</td><td>{r.replication}</td><td>{r.corrected}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="small">
          "Countries in continent tables" counts what the authors' shared code produces. The published paper's own tables list 122
          countries, including 16 in North America.
        </p>
      </div>
    </Section>
  );
}
