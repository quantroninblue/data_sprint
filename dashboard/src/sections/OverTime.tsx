import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { useEffect, useMemo, useState } from "react";
import { Section } from "../components/Chrome";
import { WorldMap } from "../components/WorldMap";
import { CAT_BY_KEY, catVar, CONTINENT_ORDER, CONTINENT_SHORT, divergingColor, gradientCss } from "../lib/theme";
import { addDays, fmtTau, formatDay, median, parseDate, useWidth } from "../lib/util";
import type { Ctx } from "./ctx";

function Multiple({ title, values, idx, color }: { title: string; values: (number | null)[]; idx: number; color: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const h = 110;
  const m = { top: 8, right: 8, bottom: 6, left: 30 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = h - m.top - m.bottom;
  const x = scaleLinear().domain([0, values.length - 1]).range([0, iw]);
  const y = scaleLinear().domain([-1, 1]).range([ih, 0]);
  const path = line<number | null>().defined((v) => v !== null).x((_, i) => x(i)).y((v) => y(v as number));
  const v = values[idx];
  return (
    <div>
      <div className="panel-head" style={{ marginBottom: 0 }}>
        <span className="panel-title" style={{ fontSize: 13 }}>{title}</span>
        <span className="panel-sub" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTau(v)}</span>
      </div>
      <div className="chart" ref={ref} style={{ height: h }}>
        {width > 0 && (
          <svg width={width} height={h} role="img" aria-label={`Median tau over time, ${title}`}>
            <g transform={`translate(${m.left},${m.top})`}>
              {[-1, 0, 1].map((t) => (
                <g key={t} className="tick" transform={`translate(0,${y(t)})`}>
                  <line x2={iw} className={t === 0 ? "baseline" : undefined} />
                  <text x={-6} dy="0.32em" textAnchor="end">{fmtTau(t)}</text>
                </g>
              ))}
              <path d={path(values) ?? ""} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
              <line x1={x(idx)} x2={x(idx)} y2={ih} stroke="var(--ink-2)" />
              {v !== null && <circle cx={x(idx)} cy={y(v)} r={4} fill={color} stroke="var(--ring)" strokeWidth={2} />}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

export function OverTime({ d, iso, setIso, cat, mode }: Ctx) {
  const starts = d.meta.rolling.starts;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const numericToIso = useMemo(() => Object.fromEntries(d.meta.countries.map((c) => [c.numeric, c.iso2])), [d.meta.countries]);
  const info = CAT_BY_KEY[cat];

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIdx((i) => (i + 1 >= starts.length ? (setPlaying(false), i) : i + 1)), 700);
    return () => clearInterval(t);
  }, [playing, starts.length]);

  const byContinent = useMemo(() => {
    const out: Record<string, (number | null)[]> = {};
    for (const c of CONTINENT_ORDER) {
      const members = d.meta.countries.filter((k) => k.continent === c).map((k) => k.iso2);
      out[c] = starts.map((_, w) => {
        const v = members.map((m) => d.rolling[m]?.[cat]?.tau[w]).filter((x): x is number => x !== null && x !== undefined);
        return v.length >= 3 ? median(v) : null;
      });
    }
    return out;
  }, [d.meta.countries, d.rolling, cat, starts]);

  const from = parseDate(starts[idx]);
  const to = addDays(from, d.meta.rolling.window_days - 1);
  const eu = byContinent.EU;
  const euFirst = eu.find((v) => v !== null) ?? null;
  const euLast = [...eu].reverse().find((v) => v !== null) ?? null;

  return (
    <Section
      id="over-time" n={8}
      title="Beyond the paper: did the link fade as the pandemic wore on?"
      dek={<>The paper stopped in June 2020. Here the same method runs over a moving {d.meta.rolling.window_days}-day window through April 2022, using 7-day average cases per 100k.</>}
    >
      <div className="play-row">
        <button className="play-btn" onClick={() => { if (idx >= starts.length - 1) setIdx(0); setPlaying(!playing); }} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <input type="range" min={0} max={starts.length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} aria-label="Time window" />
        <span className="window-label">{formatDay(from)} – {formatDay(to)}</span>
      </div>
      <div className="scale-legend" style={{ marginBottom: 8 }}>
        <span>−0.8</span><span className="bar" style={{ background: gradientCss(mode, "tau") }} /><span>+0.8</span>
        <span className="small">Strongest τ in the window · {info.label.toLowerCase()}</span>
      </div>
      <WorldMap
        ariaLabel={`Map of tau for ${info.label} in the selected window`}
        numericToIso={numericToIso}
        fill={(i) => divergingColor(mode, "tau", i ? d.rolling[i]?.[cat]?.tau[idx] : null)}
        selected={iso}
        onSelect={setIso}
        tooltip={(i, name) => (
          <>
            <div className="t-head">{i ? d.byIso[i]?.name ?? name : name}</div>
            {i && d.rolling[i] ? (
              <>
                <div className="t-row"><span className="t-val">{fmtTau(d.rolling[i][cat].tau[idx])}</span><span>τ</span></div>
                <div className="t-row"><span className="t-val">{d.rolling[i][cat].lag[idx] ?? "–"} d</span><span>lag</span></div>
              </>
            ) : <div>No data</div>}
          </>
        )}
      />
      <div className="panel">
        <div className="panel-head"><span className="panel-title">Median τ by continent, each window</span></div>
        <div className="multiples">
          {CONTINENT_ORDER.map((c) => (
            <Multiple key={c} title={CONTINENT_SHORT[c]} values={byContinent[c]} idx={idx} color={catVar(cat)} />
          ))}
        </div>
      </div>
      {euFirst !== null && euLast !== null && (
        <p className="insight">
          In Europe, the median link for {info.label.toLowerCase()} moved from τ {fmtTau(euFirst)} in the first window to {fmtTau(euLast)} by
          the last. Preliminary, but this is the kind of change the extension is meant to test.
        </p>
      )}
    </Section>
  );
}
