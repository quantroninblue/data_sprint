import { Beeswarm } from "../components/Beeswarm";
import { Section, Seg, TableView } from "../components/Chrome";
import type { Metric } from "../lib/data";
import { PAPER_LAG, PAPER_N, PAPER_TAU } from "../lib/paper";
import { CAT_BY_KEY, catVar, CONTINENT_ORDER, CONTINENT_SHORT } from "../lib/theme";
import { fmtLag, fmtP, fmtTau } from "../lib/util";
import type { Ctx } from "./ctx";

export function Continents({ d, iso, setIso, cat, metric, setMetric }: Ctx & { metric: Metric; setMetric: (m: Metric) => void }) {
  const info = CAT_BY_KEY[cat];
  const test = d.tests[cat][metric];
  const fmt = metric === "tau" ? fmtTau : fmtLag;
  const paper = metric === "tau" ? PAPER_TAU[cat] : PAPER_LAG[cat];
  const points = d.summary
    .filter((s) => s[metric][cat] !== null)
    .map((s) => ({ iso2: s.iso2, name: d.byIso[s.iso2].name, continent: s.continent, value: s[metric][cat] as number }));
  const sig = test.dunn.filter((p) => p.p_adj < 0.05).sort((a, b) => a.p_adj - b.p_adj);

  return (
    <Section
      id="continents" n={5}
      title="Continents behaved differently, and South America ran the other way"
      dek="Each dot is a country. The dark bar marks the continent median and the shaded block the middle half of countries: the paper's boxplots and Tables 1–2 in one view."
    >
      <div className="panel-head panel">
        <Seg label="Metric" value={metric} onChange={setMetric} options={[{ value: "tau", label: "Strength (τ)" }, { value: "lag", label: "Lag (days)" }]} />
        <span className="panel-sub">
          Kruskal–Wallis H = {test.kw_h.toFixed(1)}, {fmtP(test.kw_p)} · {info.label}
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
          <div className="panel-title" style={{ marginBottom: 6 }}>Replication check</div>
          <table className="data">
            <thead>
              <tr><th>Continent</th><th className="num">Ours</th><th className="num">Paper</th></tr>
            </thead>
            <tbody>
              {CONTINENT_ORDER.map((c) => (
                <tr key={c}>
                  <td>{CONTINENT_SHORT[c]}</td>
                  <td className="num">{fmt(test.medians[c] ?? null)}</td>
                  <td className="num">{fmt(paper[c])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">Medians. The paper had {Object.values(PAPER_N).reduce((a, b) => a + b, 0)} countries with complete data, and we have {points.length}.</p>
          <div className="panel-title" style={{ margin: "14px 0 6px" }}>Significant pairs (Dunn, Holm-adjusted)</div>
          {sig.length ? (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {sig.slice(0, 6).map((p) => (
                <li key={p.a + p.b}>{CONTINENT_SHORT[p.a]} vs {CONTINENT_SHORT[p.b]} · {fmtP(p.p_adj)}</li>
              ))}
            </ul>
          ) : <p className="small">No pair differs at p &lt; 0.05.</p>}
        </div>
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
