import { useMemo } from "react";
import { Heatmap } from "../components/Heatmap";
import { TimeChart } from "../components/TimeChart";
import { WorldMap } from "../components/WorldMap";
import { bestOf } from "../lib/data";
import { EVENTS } from "../lib/paper";
import { CAT_BY_KEY, CATS, catVar, CONTINENT_ORDER, gradientCss, noDataColor, VERSION_BY_KEY } from "../lib/theme";
import { dayDiff, fmtNum, fmtPct, fmtTau, median, parseDate, rolling7, useTween } from "../lib/util";
import type { Ctx } from "./ctx";

export function Overview({ d, cat, version, mode, iso, setIso }: Ctx) {
  const start = parseDate(d.meta.start);
  const paperEnd = dayDiff(start, parseDate(d.meta.paper_end));
  const days = dayDiff(start, parseDate(d.meta.end)) + 1;
  const markers = EVENTS.map((e) => ({ i: dayDiff(start, parseDate(e.date)), label: e.label }));

  const { share, n, medTau } = useMemo(() => {
    const vals = d.summary.map((s) => bestOf(s, version)?.tau[cat] ?? null).filter((v): v is number => v !== null);
    const mobility = CAT_BY_KEY[cat].mobility;
    const hits = vals.filter((v) => (mobility ? v < 0 : v > 0)).length;
    return { share: vals.length ? Math.round((hits / vals.length) * 100) : 0, n: vals.length, medTau: median(vals) };
  }, [d.summary, cat, version]);
  const numericToIso = useMemo(() => Object.fromEntries(d.meta.countries.map((c) => [c.numeric, c.iso2])), [d.meta.countries]);
  const inPaper = d.meta.countries.filter((c) => c.in_paper).length;

  // Lockdown-wave heatmap: countries grouped by continent, then ordered by the day their index first fell 20% below baseline.
  const heat = useMemo(() => {
    const h = d.context?.heat;
    if (!h) return null;
    const rows = Object.entries(h.countries)
      .filter(([iso]) => d.byIso[iso])
      .map(([iso, c]) => ({ iso2: iso, name: d.byIso[iso].name, continent: c.continent, values: c.mob, drop: c.mob.findIndex((v) => v !== null && v <= -20) }))
      .sort((a, b) => CONTINENT_ORDER.indexOf(a.continent) - CONTINENT_ORDER.indexOf(b.continent) || (a.drop < 0 ? 999 : a.drop) - (b.drop < 0 ? 999 : b.drop));
    const hs = parseDate(h.start);
    const drops = rows.filter((r) => r.drop >= 0).map((r) => r.drop).sort((a, b) => a - b);
    const q = (f: number) => drops[Math.floor(f * (drops.length - 1))];
    return { rows, start: hs, who: dayDiff(hs, parseDate("2020-03-11")), q10: q(0.1), q90: q(0.9), n: drops.length };
  }, [d.context, d.byIso]);
  const added = d.meta.countries.filter((c) => !c.in_paper);
  const shareShown = useTween(share, 1200, 0);

  const network = useMemo(
    () => CATS.map((c) => ({ key: c.key, label: c.short, color: catVar(c.key), values: rolling7(d.panel.world.mob[c.key]) })),
    [d.panel.world.mob],
  );

  const info = CAT_BY_KEY[cat];
  const when = version === "full" ? "2020–22" : "Feb–Jun 2020";
  const source = version === "published" ? "the paper's numbers" : "our numbers";
  const heroText = info.key === "parks"
    ? `of countries saw park visits fall as cases rose (${when}, ${source})`
    : info.mobility
      ? `of countries saw ${info.label.toLowerCase()} visits fall as cases rose (${when}, ${source})`
      : `of countries saw time at home rise with cases (${when}, ${source})`;

  return (
    <section className="section" id="overview" style={{ paddingTop: 48 }}>
      <div className="kicker"><span className="stop" />Stop 1 · Overview</div>
      <h1>As COVID-19 cases rose, the world moved less, and often moved first.</h1>
      <p className="dek">
        A replication of <em>Sulyok &amp; Walker (2020)</em>, using Google's Community Mobility Reports and Johns Hopkins case
        data, extended from the paper's four months to {fmtNum(days, 0)} days across {d.meta.countries.length} countries.
      </p>

      <div className="network panel reveal">
        <div className="panel-head">
          <span className="panel-title">The network: six kinds of place, median country, 7-day average vs pre-COVID baseline</span>
        </div>
        <TimeChart
          ariaLabel="Median change in mobility by place category, the six lines of the network"
          start={start} height={380} draw strokeWidth={2.5}
          series={network.map((s) => ({ ...s, width: s.key === cat ? 4 : 2.5, faded: false }))}
          band={{ from: 0, to: paperEnd, label: "Paper's window" }}
          markers={markers}
          yFormat={(v) => fmtPct(v)}
          zero
        />
      </div>

      <div className="grid-hero reveal">
        <div>
          <div className="hero-fig">{Math.round(shareShown)}%</div>
          <div className="hero-label">{heroText}</div>
        </div>
        <p className="prose" style={{ margin: 0 }}>
          Each line on the network is one kind of place Google tracks. Pick a line and every chart below follows it. Pick a
          country and you can trace it through each stop: its timeline, the lag between movement and cases, and where it sits
          among its neighbours.
        </p>
      </div>

      <div className="tiles reveal">
        <div className="tile"><div className="tile-label">Countries: paper → ours</div><div className="tile-value">{inPaper} → {d.meta.countries.length}</div></div>
        <div className="tile"><div className="tile-label">Days of data</div><div className="tile-value">{fmtNum(days, 0)}</div></div>
        <div className="tile"><div className="tile-label">Countries with a τ · {VERSION_BY_KEY[version].short}</div><div className="tile-value">{n}</div></div>
        <div className="tile"><div className="tile-label">Median τ, {info.short.toLowerCase()} · {VERSION_BY_KEY[version].short}</div><div className="tile-value">{fmtTau(medTau)}</div></div>
      </div>

      {heat && (
        <div className="panel reveal">
          <div className="panel-head">
            <span className="panel-title">
              The lockdown wave: {Math.round(heat.q90 - heat.q10)} days separated the earliest and latest 10% of countries to drop 20% below baseline
            </span>
            <div className="scale-legend">
              <span>−80%</span><span className="bar" style={{ background: gradientCss(mode, "tau") }} /><span>+80%</span>
            </div>
          </div>
          <Heatmap rows={heat.rows} start={heat.start} marker={{ i: heat.who, label: "WHO declares a pandemic" }} mode={mode} selected={iso} onSelect={setIso} />
          <p className="caption">
            Mobility index (average of retail, grocery, transit and workplaces, 7-day averages) for each country, 15 Feb – 19 Jun 2020,
            grouped by continent and ordered by the day it first fell 20% below baseline. Built from the authors' September 2020 copy of
            the Google data. Click a row to select that country.
          </p>
        </div>
      )}

      <div className="grid-2 panel reveal" style={{ gridTemplateColumns: "1.4fr 1fr", alignItems: "center" }}>
        <div>
          <div className="panel-head">
            <span className="panel-title">Coverage: the paper's {inPaper} countries and the {added.length} we added</span>
          </div>
          <WorldMap
            ariaLabel="Map of countries covered by the paper and by us"
            numericToIso={numericToIso}
            fill={(i) => (!i || !d.byIso[i] ? noDataColor(mode) : d.byIso[i].in_paper ? "var(--ink-2)" : "var(--accent)")}
            selected={iso}
            onSelect={setIso}
            tooltip={(i, name) => (
              <>
                <div className="t-head">{i ? d.byIso[i]?.name ?? name : name}</div>
                <div>{!i || !d.byIso[i] ? "No mobility data" : d.byIso[i].in_paper ? "In the paper and ours" : "Added in ours"}</div>
              </>
            )}
          />
          <div className="legend">
            <span><i style={{ background: "var(--ink-2)", height: 10, width: 10, borderRadius: 2 }} />In the paper and ours</span>
            <span><i style={{ background: "var(--accent)", height: 10, width: 10, borderRadius: 2 }} />Added in ours</span>
          </div>
        </div>
        <div>
          <p className="prose" style={{ marginTop: 0 }}>
            We joined Google's and Johns Hopkins' data on ISO country codes instead of country names, which keeps countries that are
            spelled differently in the two sources. Added in ours:
          </p>
          <p className="small">{added.map((c) => c.name).join(", ")}</p>
        </div>
      </div>

      <div className="panel reveal">
        <div className="panel-head">
          <span className="panel-title">New cases per 100k, world (7-day average)</span>
        </div>
        <TimeChart
          ariaLabel="World new COVID-19 cases per 100,000 people"
          start={start} height={200}
          series={[{ key: "cases", label: "Cases", color: "var(--ink)", values: d.panel.world.cases, area: true }]}
          band={{ from: 0, to: paperEnd, label: "Paper's window" }}
          markers={markers}
          yFormat={(v) => fmtNum(v, 0)}
          valueFormat={(v) => (v === null ? "–" : `${fmtNum(v, 1)} per 100k`)}
          directLabels={false}
        />
      </div>
      <p className="caption">Mobility is the % change from each weekday's median for 3 Jan – 6 Feb 2020. Source: Google COVID-19 Community Mobility Reports; JHU CSSE via datasets/covid-19.</p>
    </section>
  );
}
