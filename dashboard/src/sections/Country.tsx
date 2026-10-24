import { useState } from "react";
import { Section, Seg } from "../components/Chrome";
import { TimeChart } from "../components/TimeChart";
import { CATS, catVar, CLUSTER_NAMES } from "../lib/theme";
import { dayDiff, flag, fmtLag, fmtNum, fmtPct, fmtTau, parseDate } from "../lib/util";
import type { Ctx } from "./ctx";

export function CountrySection({ d, iso, cat, setCat }: Ctx) {
  const [show, setShow] = useState<"one" | "all">("all");
  const c = d.byIso[iso];
  const s = d.summaryByIso[iso];
  const p = d.panel.countries[iso];
  const start = parseDate(d.meta.start);
  const paperEnd = dayDiff(start, parseDate(d.meta.paper_end));
  const cluster = s?.cluster ? CLUSTER_NAMES[s.cluster] : null;

  return (
    <Section
      id="country" n={2}
      title={<>How {c.name} moved through the pandemic</>}
      dek="Cases on top, movement below. Both share the same timeline, so a fall in movement can be read straight against the waves of cases."
    >
      <div className="grid-2 panel" style={{ gridTemplateColumns: "minmax(260px, 0.8fr) 2fr" }}>
        <div className="ticket">
          <span className="flag" aria-hidden>{flag(iso)}</span>
          <span className="t-name">{c.name}</span>
          <span className="t-meta">
            {d.meta.continents[c.continent]} · {fmtNum(c.pop / 1e6, 1)}M people{cluster ? ` · ${cluster.name}` : ""}
          </span>
          <table className="data">
            <thead>
              <tr><th>Line</th><th className="num">τ</th><th className="num">Lag</th></tr>
            </thead>
            <tbody>
              {CATS.map((k) => (
                <tr key={k.key} onClick={() => setCat(k.key)} style={{ cursor: "pointer", fontWeight: k.key === cat ? 600 : 400 }}>
                  <td><span className="cat-cell"><span className="cat-dot" style={{ background: catVar(k.key) }} />{k.label}</span></td>
                  <td className="num">{fmtTau(s?.tau[k.key])}</td>
                  <td className="num">{fmtLag(s?.lag[k.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small" style={{ gridColumn: "1 / -1", margin: "6px 0 0" }}>
            Strongest Kendall's τ between daily cases and movement, Feb–Jun 2020. A negative lag means movement changed before cases did.
          </p>
        </div>
        <div>
          <div className="panel-head">
            <span className="panel-title">New cases per 100k (7-day average)</span>
          </div>
          <TimeChart
            ariaLabel={`New cases per 100,000 people in ${c.name}`}
            start={start} height={170}
            series={[{ key: "cases", label: "Cases", color: "var(--ink)", values: p.cases, area: true }]}
            band={{ from: 0, to: paperEnd, label: "Paper's window" }}
            yFormat={(v) => fmtNum(v, 0)}
            valueFormat={(v) => (v === null ? "–" : `${fmtNum(v, 1)} per 100k`)}
            directLabels={false}
          />
          <div className="panel-head" style={{ marginTop: 18 }}>
            <span className="panel-title">Movement vs baseline</span>
            <Seg label="Lines shown" value={show} onChange={setShow} options={[{ value: "all", label: "All lines" }, { value: "one", label: "Selected line" }]} />
          </div>
          <TimeChart
            ariaLabel={`Mobility change by category in ${c.name}`}
            start={start} height={260}
            series={CATS.filter((k) => show === "all" || k.key === cat).map((k) => ({
              key: k.key, label: k.short, color: catVar(k.key), values: p.mob[k.key], faded: show === "all" && k.key !== cat,
            }))}
            band={{ from: 0, to: paperEnd, label: "" }}
            yFormat={(v) => fmtPct(v)}
            zero
          />
        </div>
      </div>
    </Section>
  );
}
