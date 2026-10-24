import { useMemo } from "react";
import { TimeChart } from "../components/TimeChart";
import { CAT_BY_KEY, CATS, catVar } from "../lib/theme";
import { dayDiff, fmtNum, fmtPct, fmtTau, median, parseDate } from "../lib/util";
import type { Ctx } from "./ctx";

export function Overview({ d, cat }: Ctx) {
  const start = parseDate(d.meta.start);
  const paperEnd = dayDiff(start, parseDate(d.meta.paper_end));
  const days = dayDiff(start, parseDate(d.meta.end)) + 1;

  const { share, n, medTau } = useMemo(() => {
    const vals = d.summary.map((s) => s.tau[cat]).filter((v): v is number => v !== null);
    const mobility = CAT_BY_KEY[cat].mobility;
    const hits = vals.filter((v) => (mobility ? v < 0 : v > 0)).length;
    return { share: Math.round((hits / vals.length) * 100), n: vals.length, medTau: median(vals) };
  }, [d.summary, cat]);

  const info = CAT_BY_KEY[cat];
  const heroText = info.key === "parks"
    ? "of countries saw park visits fall as cases rose (Feb–Jun 2020)"
    : info.mobility
      ? `of countries saw ${info.label.toLowerCase()} visits fall as cases rose (Feb–Jun 2020)`
      : "of countries saw time at home rise with cases (Feb–Jun 2020)";

  return (
    <section className="section" id="overview" style={{ paddingTop: 48 }}>
      <div className="kicker"><span className="stop" />Stop 1 · Overview</div>
      <h1>As COVID-19 cases rose, the world moved less, and often moved first.</h1>
      <p className="dek">
        A replication of <em>Sulyok &amp; Walker (2020)</em>, using Google's Community Mobility Reports and Johns Hopkins case
        data, extended from the paper's four months to {fmtNum(days, 0)} days across {d.meta.countries.length} countries.
      </p>

      <div className="grid-hero">
        <div>
          <div className="hero-fig">{share}%</div>
          <div className="hero-label">{heroText}</div>
        </div>
        <p className="prose" style={{ margin: 0 }}>
          Each line on the network above is one kind of place Google tracks. Pick a line and every chart below follows it. Pick a
          country and you can trace it through each stop: its timeline, the lag between movement and cases, and where it sits
          among its neighbours.
        </p>
      </div>

      <div className="tiles">
        <div className="tile"><div className="tile-label">Countries</div><div className="tile-value">{d.meta.countries.length}</div></div>
        <div className="tile"><div className="tile-label">Days of data</div><div className="tile-value">{fmtNum(days, 0)}</div></div>
        <div className="tile"><div className="tile-label">Countries with a τ ({info.short})</div><div className="tile-value">{n}</div></div>
        <div className="tile"><div className="tile-label">Median τ, {info.short.toLowerCase()}</div><div className="tile-value">{fmtTau(medTau)}</div></div>
      </div>

      <div className="grid-2 panel">
        <div>
          <div className="panel-head">
            <span className="panel-title">New cases per 100k, world (7-day average)</span>
          </div>
          <TimeChart
            ariaLabel="World new COVID-19 cases per 100,000 people"
            start={start}
            series={[{ key: "cases", label: "Cases", color: "var(--ink)", values: d.panel.world.cases, area: true }]}
            band={{ from: 0, to: paperEnd, label: "Paper's window" }}
            yFormat={(v) => fmtNum(v, 0)}
            valueFormat={(v) => (v === null ? "–" : `${fmtNum(v, 1)} per 100k`)}
            directLabels={false}
          />
        </div>
        <div>
          <div className="panel-head">
            <span className="panel-title">Mobility vs pre-COVID baseline, median country</span>
          </div>
          <TimeChart
            ariaLabel="Median change in mobility by place category"
            start={start}
            series={CATS.map((c) => ({ key: c.key, label: c.short, color: catVar(c.key), values: d.panel.world.mob[c.key], faded: c.key !== cat }))}
            band={{ from: 0, to: paperEnd, label: "" }}
            yFormat={(v) => fmtPct(v)}
            zero
          />
        </div>
      </div>
      <p className="caption">Shaded: the paper's study period, 15 Feb – 19 Jun 2020. Mobility is the % change from each weekday's median for 3 Jan – 6 Feb 2020.</p>
    </section>
  );
}
