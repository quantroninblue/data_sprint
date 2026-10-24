import { useState } from "react";
import { Section, Seg } from "../components/Chrome";
import { TimeChart } from "../components/TimeChart";
import { EVENTS } from "../lib/paper";
import { CATS, catVar, CLUSTER_NAMES, VERSIONS } from "../lib/theme";
import { dayDiff, flag, fmtLag, fmtNum, fmtPct, fmtTau, parseDate } from "../lib/util";
import type { Ctx } from "./ctx";

export function CountrySection({ d, iso, cat, setCat, version }: Ctx) {
  const [show, setShow] = useState<"one" | "all">("all");
  const c = d.byIso[iso];
  const s = d.summaryByIso[iso];
  const p = d.panel.countries[iso];
  const start = parseDate(d.meta.start);
  const paperEnd = dayDiff(start, parseDate(d.meta.paper_end));
  const clusterType = version === "published" ? s?.cluster.published : s?.cluster.corrected;
  const cluster = clusterType ? CLUSTER_NAMES[clusterType] : null;
  const markers = EVENTS.map((e) => ({ i: dayDiff(start, parseDate(e.date)), label: e.label }));

  return (
    <Section
      id="country" n={2}
      title={<>How {c.name} moved through the pandemic</>}
      dek="Cases on top, movement below. Both share the same timeline, so a fall in movement can be read straight against the waves of cases."
    >
      <div className="grid-2 panel" style={{ gridTemplateColumns: "minmax(260px, 0.8fr) 2fr" }}>
        <div className="ticket reveal">
          <div className="ticket-head">
            <span className="flag" aria-hidden>{flag(iso)}</span>
            <div>
              <div className="t-label">Passenger · paper vs ours</div>
              <div className="t-name">{c.name}</div>
              <div className="t-meta">{d.meta.continents[c.continent]} · {fmtNum(c.pop / 1e6, 1)}M people</div>
            </div>
            {cluster && <span className="stamp" title={cluster.blurb}>{cluster.name}</span>}
          </div>
          <div className="perforation" aria-hidden />
          <table className="data fare">
            <thead>
              <tr>
                <th>Line</th>
                {VERSIONS.map((v) => <th key={v.key} className="num" style={{ color: v.key === version ? "var(--ink)" : undefined }}>{v.short}</th>)}
              </tr>
            </thead>
            <tbody>
              {CATS.map((k) => (
                <tr key={k.key} onClick={() => setCat(k.key)} style={{ cursor: "pointer", fontWeight: k.key === cat ? 600 : 400 }}>
                  <td><span className="cat-cell"><span className="cat-dot" style={{ background: catVar(k.key) }} />{k.short}</span></td>
                  {VERSIONS.map((v) => {
                    const b = s?.[v.key];
                    return (
                      <td key={v.key} className="num">
                        {fmtTau(b?.tau[k.key])}
                        <div className="fare-lag">{fmtLag(b?.lag[k.key])}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small" style={{ margin: "8px 0 0" }}>
            Strongest Kendall's τ between daily cases and movement, with its lag underneath. A negative lag means movement changed before
            cases did. {s?.published ? "" : `${c.name} isn't in the paper's tables. `}2020–22 uses 7-day averages.
          </p>
        </div>
        <div className="reveal">
          <div className="panel-head">
            <span className="panel-title">New cases per 100k (7-day average)</span>
          </div>
          <TimeChart
            ariaLabel={`New cases per 100,000 people in ${c.name}`}
            start={start} height={170}
            series={[{ key: "cases", label: "Cases", color: "var(--ink)", values: p.cases, area: true }]}
            band={{ from: 0, to: paperEnd, label: "Paper's window" }}
            markers={markers}
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
            markers={markers}
            yFormat={(v) => fmtPct(v)}
            zero
          />
        </div>
      </div>
    </Section>
  );
}
