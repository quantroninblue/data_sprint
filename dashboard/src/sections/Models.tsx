import { scaleLinear } from "d3-scale";
import { useState } from "react";
import { Section, Seg } from "../components/Chrome";
import { TimeChart } from "../components/TimeChart";
import type { ModelKey } from "../lib/data";
import { MODEL_LABELS } from "../lib/paper";
import { fmtNum, parseDate, useWidth } from "../lib/util";
import type { Ctx } from "./ctx";

const KEYS: ModelKey[] = ["date", "mobility", "lagged"];

function Bars({ values, format, note }: { values: Record<ModelKey, number>; format: (v: number) => string; note: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const best = KEYS.reduce((a, b) => (values[a] <= values[b] ? a : b));
  const lo = Math.min(...KEYS.map((k) => values[k]));
  const hi = Math.max(...KEYS.map((k) => values[k]));
  const pad = (hi - lo) * 0.6 || 1;
  const labelW = 170;
  const innerW = Math.max(0, width - labelW - 70);
  const x = scaleLinear().domain([lo - pad, hi + pad * 0.2]).range([0, innerW]);
  const rowH = 34;
  return (
    <div className="chart" ref={ref} style={{ height: rowH * 3 + 22 }}>
      {width > 0 && (
        <svg width={width} height={rowH * 3 + 22} role="img" aria-label={note}>
          {KEYS.map((k, i) => {
            const w = x(values[k]);
            return (
              <g key={k} transform={`translate(0,${i * rowH})`}>
                <text x={0} y={rowH / 2} dy="0.32em" className="direct-label">{MODEL_LABELS[k]}</text>
                <path d={`M${labelW},${rowH / 2 - 9} h${Math.max(0, w - 4)} a4,4 0 0 1 4,4 v10 a4,4 0 0 1 -4,4 h${-Math.max(0, w - 4)} z`} fill={k === best ? "var(--accent)" : "var(--axis)"} />
                <text x={labelW + w + 8} y={rowH / 2} dy="0.32em" className={k === best ? "annot-strong" : "annot"}>
                  {format(values[k])}{k === best ? " · best" : ""}
                </text>
              </g>
            );
          })}
          <text x={labelW} y={rowH * 3 + 14} className="annot">{note}</text>
        </svg>
      )}
    </div>
  );
}

function Coefficients({ rows }: { rows: { term: string; estimate: number; se: number; p: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const data = rows.filter((r) => !r.term.startsWith("Date"));
  const labelW = 150;
  const innerW = Math.max(0, width - labelW - 20);
  const x = scaleLinear().domain([-2.8, 1.4]).range([0, innerW]);
  const rowH = 32;
  const h = rowH * data.length + 28;
  return (
    <div className="chart" ref={ref} style={{ height: h }}>
      {width > 0 && (
        <svg width={width} height={h} role="img" aria-label="Model coefficients with 95% intervals">
          <g transform={`translate(${labelW},0)`}>
            {[-2, -1, 0, 1].map((t) => (
              <g key={t} className="tick" transform={`translate(${x(t)},0)`}>
                <line y2={rowH * data.length} />
                <text y={rowH * data.length + 16} textAnchor="middle">{t}</text>
              </g>
            ))}
            <line x1={x(0)} x2={x(0)} y2={rowH * data.length} className="baseline" />
          </g>
          {data.map((r, i) => {
            const sig = r.p < 0.05;
            const cy = i * rowH + rowH / 2;
            return (
              <g key={r.term}>
                <text x={0} y={cy} dy="0.32em" className="direct-label">{r.term}</text>
                <g transform={`translate(${labelW},0)`}>
                  <line x1={x(r.estimate - 1.96 * r.se)} x2={x(r.estimate + 1.96 * r.se)} y1={cy} y2={cy} stroke={sig ? "var(--accent)" : "var(--muted)"} strokeWidth={2} strokeLinecap="round" />
                  <circle cx={x(r.estimate)} cy={cy} r={5} fill={sig ? "var(--accent)" : "var(--muted)"} stroke="var(--ring)" strokeWidth={2} />
                  <text x={x(r.estimate + 1.96 * r.se) + 8} y={cy} dy="0.32em" className={sig ? "annot-strong" : "annot"}>
                    {r.estimate.toFixed(2)}{sig ? ` · p = ${r.p.toFixed(3)}` : ""}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function Models({ d, iso }: Ctx) {
  const [model, setModel] = useState<ModelKey>("lagged");
  const m = d.models;
  const pred = m.predictions[iso];
  const c = d.byIso[iso];

  return (
    <Section
      id="models" n={7}
      title="Does knowing how people move help forecast cases?"
      dek="Three mixed-effects GAMs with a random intercept per country: one with date only, one adding same-day movement, one adding movement over the previous two weeks. They are trained to 19 June 2020 and tested on the following 11 weeks."
    >
      <div className="grid-2 panel">
        <div>
          <div className="panel-title" style={{ marginBottom: 8 }}>In-sample fit · BIC (lower is better)</div>
          <Bars values={m.paper.bic} format={(v) => fmtNum(v, 0)} note="Values from the paper" />
          <div className="panel-title" style={{ margin: "18px 0 8px" }}>Out-of-sample error · RMSE, cases/day (lower is better)</div>
          <Bars values={m.paper.rmse} format={(v) => fmtNum(v, 0)} note="Values from the paper, 20 Jun – 8 Sep 2020" />
        </div>
        <div>
          <div className="panel-title" style={{ marginBottom: 8 }}>What moves the forecast · same-day model coefficients, 95% CI</div>
          <Coefficients rows={m.paper.coefficients} />
          <p className="caption">Only retail &amp; recreation is significant: more retail activity, fewer reported cases. Values from the paper's Table 3.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Forecast vs observed · {c.name}, cases per 100k</span>
          <Seg label="Model" value={model} onChange={setModel} options={KEYS.map((k) => ({ value: k, label: MODEL_LABELS[k] }))} />
        </div>
        {pred ? (
          <TimeChart
            ariaLabel={`Observed and forecast cases for ${c.name}`}
            start={parseDate(m.valid_start)} height={240}
            series={[
              { key: "obs", label: "Observed", color: "var(--ink)", values: pred.observed, area: true },
              { key: "pred", label: "Forecast", color: "var(--accent)", values: pred[model] },
            ]}
            yFormat={(v) => fmtNum(v, 0)}
            valueFormat={(v) => (v === null ? "–" : `${fmtNum(v, 1)} per 100k`)}
          />
        ) : <p className="small">No forecast for this country.</p>}
        {m.simulated_forecasts && (
          <div className="notice">These forecast lines are simulated placeholders. They will be replaced by predictions from the R models.</div>
        )}
      </div>
    </Section>
  );
}
