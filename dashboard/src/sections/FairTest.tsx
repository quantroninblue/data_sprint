import { scaleLinear } from "d3-scale";
import { useState } from "react";
import { BandChart } from "../components/BandChart";
import { Beeswarm } from "../components/Beeswarm";
import { Section, Seg } from "../components/Chrome";
import type { Cat } from "../lib/data";
import { CAT_BY_KEY, catVar, CONTINENT_ORDER, CONTINENT_SHORT } from "../lib/theme";
import { fmtLag, fmtTau, median, useWidth } from "../lib/util";
import type { Ctx } from "./ctx";

const BIN = 0.05;

/** Two histograms of |τ| on one shared scale: real country pairs and wrong-country pairs. */
function PairHistograms({ real, fake, color }: { real: number[]; fake: number[]; color: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const bins = Array.from({ length: Math.round(1 / BIN) }, (_, i) => i * BIN);
  const count = (v: number[]) => bins.map((b) => v.filter((x) => x >= b && x < b + BIN).length / v.length);
  const rows = [
    { key: "real", label: "Real pairs: a country's mobility vs its own cases", share: count(real), med: median(real), color },
    { key: "fake", label: "Fake pairs: a country's mobility vs another country's cases", share: count(fake), med: median(fake), color: "var(--muted)" },
  ];
  const rowH = 96;
  const m = { left: 8, right: 8 };
  const iw = Math.max(0, width - m.left - m.right);
  const x = scaleLinear().domain([0, 1]).range([0, iw]);
  const y = scaleLinear().domain([0, Math.max(...rows.flatMap((r) => r.share))]).range([0, rowH - 34]);
  const bw = Math.min(24, iw / bins.length - 2);
  return (
    <div className="chart" ref={ref} style={{ height: rowH * 2 + 22 }}>
      {width > 0 && (
        <svg width={width} height={rowH * 2 + 22} role="img" aria-label="Histograms of the strongest |tau| for real and fake country pairs">
          <g transform={`translate(${m.left},0)`}>
            {rows.map((r, k) => {
              const base = k * rowH + rowH - 8;
              return (
                <g key={r.key}>
                  <text x={0} y={k * rowH + 14} className="direct-label">{r.label}</text>
                  {bins.map((b, i) => {
                    const h = y(r.share[i]);
                    return h > 0 ? <rect key={b} x={x(b) + 1} y={base - h} width={bw} height={h} rx={Math.min(3, h / 2)} fill={r.color} /> : null;
                  })}
                  <line x1={0} x2={iw} y1={base} y2={base} className="baseline" />
                  <line x1={x(r.med)} x2={x(r.med)} y1={base - (rowH - 30)} y2={base} stroke="var(--ink)" strokeWidth={2} />
                  <text x={x(r.med) + 6} y={base - (rowH - 38)} className="annot-strong">median {r.med.toFixed(2)}</text>
                </g>
              );
            })}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <text key={t} className="annot" x={x(t)} y={rowH * 2 + 16} textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}>{t.toFixed(2)}</text>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}

export function FairTest({ d, cat, iso, setIso }: Ctx) {
  const [sample, setSample] = useState<"main" | "full">("main");
  const f = d.fair;
  const placeboCat: Cat = f.placebo.fake[cat] ? cat : "retail";
  const real = f.placebo.real[placeboCat] ?? [];
  const fake = f.placebo.fake[placeboCat] ?? [];
  const prof = f.profiles[sample].index;
  const peak = prof.real.reduce((a, b) => (b.v > a.v ? b : a));
  const countries = f.countries[sample];
  const sig = new Set(countries.filter((c) => c.q_transmission < 0.1).map((c) => c.iso2));
  const rightSign = countries.filter((c) => c.tau_transmission > 0).length;
  const medBy = (c: (typeof CONTINENT_ORDER)[number]) => {
    const v = countries.filter((k) => k.continent === c).map((k) => k.tau_transmission);
    return v.length ? median(v) : null;
  };
  const toPts = (p: { lag: number; v: number; lo: number; hi: number }[]) => p.map((q) => ({ x: q.lag, v: q.v, lo: q.lo, hi: q.hi }));
  const sampleLabel = sample === "main" ? "15 Feb – 19 Jun 2020" : "15 Feb – 8 Sep 2020";

  return (
    <Section
      id="fair" n={6}
      title="Does the link survive a fair test?"
      dek="The paper's correlation can't tell a country's own link from the shared timing of spring 2020, when mobility fell everywhere while cases rose everywhere. Two tests: pair each country with the wrong country's cases, then measure the link a better way."
    >
      <div className="grid-2 panel">
        <div>
          <div className="panel-head">
            <span className="panel-title">Fake pairs look just as correlated as real ones · {CAT_BY_KEY[placeboCat].label.toLowerCase()}, paper's method</span>
          </div>
          <PairHistograms real={real} fake={fake} color={catVar(placeboCat)} />
          <p className="caption">
            Strongest |τ| per country, Feb–Jun 2020.{placeboCat !== cat ? ` The fake-pair test was run for retail, transit, workplaces and residential, so this shows retail.` : ""}{" "}
            If the method measured each country's own link, the fake pairs would score much lower. They don't.
          </p>
        </div>
        <div>
          <div className="panel-head">
            <span className="panel-title">The paper's method: real vs fake pairs at every lag</span>
          </div>
          <BandChart
            ariaLabel="Mean strongest |tau| at each lag for real and fake pairs, paper's method"
            series={[
              { key: "real", label: "Real pairs", color: catVar("retail"), points: toPts(f.paper_profile.real) },
              { key: "fake", label: "Fake pairs", color: "var(--muted)", points: toPts(f.paper_profile.placebo) },
            ]}
            xDomain={[-28, 28]} xTicks={[-28, -14, 0, 14, 28]} xFormat={(v) => (v === 0 ? "0" : fmtLag(v))}
            yFormat={(v) => v.toFixed(2)} leftNote="← movement leads" rightNote="cases lead →"
          />
          <p className="caption">Mean |τ| across countries, retail, with 95% bands. The two curves track each other at every lag.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">A fairer measure: mobility against case growth, with the shared daily trend removed</span>
          <Seg label="Sample" value={sample} onChange={setSample} options={[{ value: "main", label: "Paper's window" }, { value: "full", label: "To 8 Sep 2020" }]} />
        </div>
        <div className="grid-2">
          <div>
            <BandChart
              ariaLabel="Kendall's tau at each lag, fixed method, real and fake pairs"
              series={[
                { key: "real", label: "Real pairs", color: "var(--accent)", points: toPts(prof.real) },
                { key: "fake", label: "Fake pairs", color: "var(--muted)", points: toPts(prof.placebo) },
              ]}
              xDomain={[-28, 28]} xTicks={[-28, -14, 0, 14, 28]} xFormat={(v) => (v === 0 ? "0" : fmtLag(v))}
              yFormat={(v) => fmtTau(v)} leftNote="← movement leads" rightNote="case growth leads →"
            />
          </div>
          <div className="readout" style={{ alignContent: "start" }}>
            <div><div className="r-val">{fmtTau(peak.v)}</div><div className="r-label">Peak τ ({fmtTau(peak.lo)} to {fmtTau(peak.hi)}), {sampleLabel}</div></div>
            <div><div className="r-val">{Math.abs(peak.lag)} days</div><div className="r-label">Movement leads case growth</div></div>
            <div><div className="r-val">{rightSign} of {countries.length}</div><div className="r-label">countries show the expected sign; {sig.size} pass a false-discovery test</div></div>
          </div>
        </div>
        <p className="caption">
          Weekly case growth instead of counts, 7-day averages, each day's cross-country average removed, one mobility index (first
          principal component of five categories) and fixed lag windows instead of the best of 57. The fake pairs now score zero.
        </p>
        <div className="differs">
          <strong>How this differs from the paper's number.</strong> The paper's τ is about −0.5 (more cases, less movement); this one is
          about +0.13 (more movement, faster case growth about two weeks later). They measure different things: the paper correlates
          levels that both trend through spring 2020, while this compares growth after the shared trend is removed. The sign flips
          because falling movement is followed by <em>slower growth</em>, not by fewer cases on the same days.
        </div>
      </div>

      <div className="grid-2 panel" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div>
          <div className="panel-head">
            <span className="panel-title">Each country's link, fair measure · bright dots pass the false-discovery test</span>
          </div>
          <Beeswarm
            ariaLabel="Per-country transmission tau by continent, fixed method"
            points={countries.map((c) => ({ iso2: c.iso2, name: d.byIso[c.iso2]?.name ?? c.iso2, continent: c.continent, value: c.tau_transmission }))}
            domain={[-0.6, 0.6]} format={fmtTau} color="var(--accent)" selected={iso} onSelect={setIso} highlight={sig}
          />
        </div>
        <div>
          <div className="panel-title" style={{ marginBottom: 6 }}>Continent medians: the two methods disagree</div>
          <table className="data">
            <thead><tr><th>Continent</th><th className="num">Paper's method</th><th className="num">Fair measure</th></tr></thead>
            <tbody>
              {CONTINENT_ORDER.map((c) => (
                <tr key={c} style={{ fontWeight: c === "SA" ? 600 : 400 }}>
                  <td>{CONTINENT_SHORT[c]}</td>
                  <td className="num">{fmtTau(d.tests.ours.retail.tau.medians[c] ?? null)}</td>
                  <td className="num">{fmtTau(medBy(c))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">
            Paper's method: retail, Feb–Jun 2020 (expected sign negative). Fair measure: mobility index against case growth (expected sign
            positive). <strong>South America flips</strong> from the paper's odd one out to one of the strongest links: its epidemic simply
            started later, which the shared-timing method reads as an opposite relationship.
          </p>
        </div>
      </div>
      {d.context && d.context.timing.length > 0 && <WhoMovedFirst d={d} iso={iso} setIso={setIso} />}
    </Section>
  );
}

/** For each country: the day mobility first fell 20% below baseline minus the day cases reached 1 per million. */
function WhoMovedFirst({ d, iso, setIso }: Pick<Ctx, "d" | "iso" | "setIso">) {
  const t = d.context!.timing.filter((r) => d.byIso[r.iso2]);
  const first = t.filter((r) => r.gap < 0).length;
  const share = Math.round((100 * first) / t.length);
  const med = median(t.map((r) => r.gap));
  const lim = Math.min(90, Math.max(30, ...t.map((r) => Math.abs(r.gap))));
  const fmtGap = (v: number) => (v === 0 ? "same day" : v < 0 ? `${Math.abs(v)} d earlier` : `${v} d later`);
  return (
    <div className="grid-2 panel" style={{ gridTemplateColumns: "2fr 1fr" }}>
      <div>
        <div className="panel-head">
          <span className="panel-title">Who moved first? A direct check with no lag search</span>
        </div>
        <Beeswarm
          ariaLabel="Days between mobility falling 20% and cases reaching 1 per million, by continent"
          points={t.map((r) => ({ iso2: r.iso2, name: d.byIso[r.iso2].name, continent: r.continent, value: r.gap }))}
          domain={[-lim, lim]} format={fmtGap} color="var(--accent)" selected={iso} onSelect={setIso}
        />
        <p className="caption">
          Each dot is a country: the day its mobility index first fell 20% below baseline, minus the day its cumulative cases reached 1
          per million people. Below zero, mobility fell first.
        </p>
      </div>
      <div className="readout" style={{ alignContent: "start" }}>
        <div><div className="r-val">{share}%</div><div className="r-label">of {t.length} countries cut mobility before cases reached 1 per million</div></div>
        <div><div className="r-val">{fmtGap(med)}</div><div className="r-label">median gap between the two</div></div>
        <div className="differs" style={{ marginTop: 0 }}>
          <strong>{share >= 50 ? "This supports the paper's reading," : "This doesn't support the paper's reading,"}</strong> that
          behaviour moved early, and it doesn't rely on the lag search the fake-pair test discredits. It also shows why a correlation
          can't show direction: one shared shock, the WHO declaration and the news around it, moved mobility everywhere at once.
        </div>
      </div>
    </div>
  );
}
