import { useMemo, useState } from "react";
import { Section, Seg, TableView } from "../components/Chrome";
import { WorldMap } from "../components/WorldMap";
import type { Metric } from "../lib/data";
import { CAT_BY_KEY, CATS, catVar, divergingColor, gradientCss } from "../lib/theme";
import { fmtLag, fmtTau } from "../lib/util";
import type { Ctx } from "./ctx";

export function MapSection({ d, iso, setIso, cat, setCat, mode, metric, setMetric }: Ctx & { metric: Metric; setMetric: (m: Metric) => void }) {
  const [sortKey, setSortKey] = useState<"name" | "value">("value");
  const numericToIso = useMemo(() => Object.fromEntries(d.meta.countries.map((c) => [c.numeric, c.iso2])), [d.meta.countries]);
  const value = (i: string | undefined, c = cat) => (i ? d.summaryByIso[i]?.[metric][c] ?? null : null);
  const fmt = metric === "tau" ? fmtTau : fmtLag;
  const info = CAT_BY_KEY[cat];

  const rows = d.summary
    .map((s) => ({ iso2: s.iso2, name: d.byIso[s.iso2].name, v: s[metric][cat] }))
    .sort((a, b) => (sortKey === "name" ? a.name.localeCompare(b.name) : (a.v ?? 99) - (b.v ?? 99)));

  return (
    <Section
      id="map" n={4}
      title={metric === "tau" ? "Where movement and cases moved in opposite directions" : "Where movement changed before cases"}
      dek="The paper's Figures 1 and 2, redrawn. Click a country to follow it through the rest of the dashboard, and use the small maps to switch lines."
    >
      <div className="panel-head panel">
        <Seg label="Map metric" value={metric} onChange={setMetric} options={[{ value: "tau", label: "Strength (τ)" }, { value: "lag", label: "Lag (days)" }]} />
        <div className="scale-legend">
          <span>{metric === "tau" ? "−0.8 · cases up, movement down" : "−28 d · movement first"}</span>
          <span className="bar" style={{ background: gradientCss(mode, metric) }} />
          <span>{metric === "tau" ? "+0.8 · both rise" : "+28 d · cases first"}</span>
        </div>
      </div>

      <WorldMap
        ariaLabel={`World map of ${metric === "tau" ? "Kendall's tau" : "lag"} for ${info.label}`}
        numericToIso={numericToIso}
        fill={(i) => divergingColor(mode, metric, value(i))}
        selected={iso}
        onSelect={setIso}
        tooltip={(i, name) => {
          const s = i ? d.summaryByIso[i] : undefined;
          return (
            <>
              <div className="t-head">{i ? d.byIso[i]?.name ?? name : name}</div>
              {s ? (
                <>
                  <div className="t-row"><span className="t-val">{fmtTau(s.tau[cat])}</span><span>τ, {info.short.toLowerCase()}</span></div>
                  <div className="t-row"><span className="t-val">{fmtLag(s.lag[cat])}</span><span>lag to peak</span></div>
                </>
              ) : <div>No mobility data</div>}
            </>
          );
        }}
      />

      <div className="mini-maps">
        {CATS.map((c) => (
          <button key={c.key} className="mini-map" aria-pressed={c.key === cat} onClick={() => setCat(c.key)}>
            <div className="mm-title"><span className="cat-dot" style={{ background: catVar(c.key) }} />{c.label}</div>
            <WorldMap
              compact
              ariaLabel={`Small map for ${c.label}`}
              numericToIso={numericToIso}
              fill={(i) => divergingColor(mode, metric, value(i, c.key))}
            />
          </button>
        ))}
      </div>

      <TableView label={`Show table: ${info.label.toLowerCase()}, ${metric === "tau" ? "τ" : "lag"} by country`}>
        <table className="data">
          <thead>
            <tr>
              <th style={{ cursor: "pointer" }} onClick={() => setSortKey("name")}>Country</th>
              <th className="num" style={{ cursor: "pointer" }} onClick={() => setSortKey("value")}>{metric === "tau" ? "τ" : "Lag"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.iso2} onClick={() => setIso(r.iso2)} style={{ cursor: "pointer", fontWeight: r.iso2 === iso ? 600 : 400 }}>
                <td>{r.name}</td><td className="num">{fmt(r.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </Section>
  );
}
