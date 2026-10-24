import { useMemo, type ReactNode } from "react";
import { Section } from "../components/Chrome";
import { bestOf, type Version } from "../lib/data";
import { CAT_BY_KEY } from "../lib/theme";
import { fmtLag, fmtTau, median } from "../lib/util";
import type { Ctx } from "./ctx";

interface Hypothesis { title: string; idea: ReactNode; expect: string; test: string; ours?: boolean }

export function WhyChanged({ d, cat }: Ctx) {
  const info = CAT_BY_KEY[cat];

  const stats = useMemo(() => {
    const per = (v: Version) => {
      const rows = d.summary.map((s) => bestOf(s, v)).filter((b) => b && b.tau[cat] !== null && b.lag[cat] !== null);
      const taus = rows.map((b) => b!.tau[cat] as number);
      const lags = rows.map((b) => b!.lag[cat] as number);
      const expected = taus.filter((t) => (info.mobility ? t < 0 : t > 0)).length;
      return {
        n: rows.length,
        medTau: median(taus),
        edge: rows.length ? Math.round((100 * lags.filter((l) => Math.abs(l) >= 27).length) / rows.length) : 0,
        expected: rows.length ? Math.round((100 * expected) / rows.length) : 0,
      };
    };
    let flips = 0, both = 0;
    for (const s of d.summary) {
      const a = s.ours?.tau[cat], b = s.full?.tau[cat];
      if (a === null || a === undefined || b === null || b === undefined) continue;
      both++;
      if (Math.sign(a) !== Math.sign(b)) flips++;
    }
    return { published: per("published"), ours: per("ours"), full: per("full"), flips, both };
  }, [d.summary, cat, info.mobility]);

  // The properly measured link (local projections), 2020 vs Sep 2020 – Apr 2022.
  const peak = (pts: { h: number; beta: number }[]) => pts.reduce((a, b) => (Math.abs(b.beta) > Math.abs(a.beta) ? b : a));
  const lpMain = peak(d.fair.lp.main.transmission.index);
  const lpExt = peak(d.fair.lp.ext.transmission.index);
  const pct = (b: number) => `+${Math.round((Math.exp(b) - 1) * 100)}%`;
  const fixedPeak = d.fair.profiles.main.index.real.reduce((a, b) => (b.v > a.v ? b : a));
  const retailMed = median(d.summary.map((x) => x.ours?.tau.retail ?? null).filter((v): v is number => v !== null));

  const lagAF = d.tests.ours[cat].lag.medians.AF;
  const lagEU = d.tests.ours[cat].lag.medians.EU;

  const hypotheses: Hypothesis[] = [
    {
      title: "Vaccination",
      idea: "From early 2021, vaccines cut the risk of serious illness, so a rise in cases gave people less reason to stay home.",
      expect: "The link fades first in countries that vaccinated early and quickly.",
      test: "Compare each country's rolling τ with its vaccination coverage over time.",
    },
    {
      title: "Restrictions eased",
      idea: "Governments lifted lockdowns and travel bans, so movement recovered by rule even while cases rose.",
      expect: "Mobility recovers in steps that line up with policy dates rather than with case curves.",
      test: "Line rolling τ up against a policy-stringency index for each country.",
    },
    {
      title: "Pandemic fatigue",
      idea: "After months of restrictions, people got used to the risk, grew bolder and stopped reacting to case numbers.",
      expect: "A gradual fade everywhere, even where the rules stayed strict.",
      test: "Compare countries that kept restrictions with those that eased them, using survey data on adherence.",
    },
    {
      title: "New variants",
      idea: "Omicron, from late 2021, brought record case numbers that were often mild, so huge case spikes came with little change in behaviour.",
      expect: "The sharpest breakdown in the last windows, around the Omicron wave.",
      test: "Split the windows before and after each variant took over, and use hospitalisations instead of cases.",
    },
    {
      title: "Testing changed",
      idea: "Testing scaled up through 2020, and by 2022 many home tests were never reported, so official cases drifted away from real infections.",
      expect: "Weaker links where testing policy changed the most.",
      test: "Adjust for testing rates or test positivity before correlating.",
    },
    {
      title: "An out-of-date baseline",
      idea: "Google measures change against January–February 2020. Two years later, seasons, remote work and habits had shifted, so \"% vs baseline\" means something different.",
      expect: "Seasonal swings, such as park visits in summer, dominating the later windows.",
      test: "Re-base mobility to a later period, or remove seasonality before correlating.",
    },
    {
      title: "Under-reporting and reporting delays",
      ours: true,
      idea: (
        <>
          Where testing and health services are harder to reach, many cases go unrecorded and others are reported days or weeks late.
          Late reports push the case curve later, which makes movement look as if it moved first: a fake lead. This could affect the
          2020 results too, not just the later period.
          {lagAF !== undefined && lagEU !== undefined && (
            <> In 2020, Africa's median best lag for {info.label.toLowerCase()} is <strong>{fmtLag(lagAF)}</strong>, against{" "}
              <strong>{fmtLag(lagEU)}</strong> for Europe.</>
          )}
        </>
      ),
      expect: "More negative lags, and more lags at the −28-day edge, where reporting is weaker.",
      test: "Compare lags by income group or health-system capacity, and check against excess deaths or antibody surveys instead of reported cases.",
    },
  ];

  return (
    <Section
      id="why" n={10}
      title="Why did the link fade? Our hypotheses"
      dek="In the paper's four months, movement and cases looked tightly linked. Over the full two years the raw correlation all but disappears, while a better-measured link roughly halves. Our data shows that it changed, not why."
    >
      <div className="tiles reveal">
        <div className="tile">
          <div className="tile-label">Median τ, {info.short.toLowerCase()}</div>
          <div className="tile-value">{fmtTau(stats.ours.medTau)} → {fmtTau(stats.full.medTau)}</div>
          <div className="small">Ours 2020 → 2020–22 · paper {fmtTau(stats.published.medTau)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Countries that flip sign</div>
          <div className="tile-value">{stats.flips} of {stats.both}</div>
          <div className="small">2020 → 2020–22</div>
        </div>
        <div className="tile">
          <div className="tile-label">Best lags at the ±27–28-day edge</div>
          <div className="tile-value">{stats.ours.edge}% → {stats.full.edge}%</div>
          <div className="small">Paper {stats.published.edge}% · about 7% expected by chance</div>
        </div>
        <div className="tile">
          <div className="tile-label">Properly measured link, weekly growth per SD of mobility</div>
          <div className="tile-value">{pct(lpMain.beta)} → {pct(lpExt.beta)}</div>
          <div className="small">2020 ({lpMain.h} days later) → Sep 2020 – Apr 2022 ({lpExt.h} days later)</div>
        </div>
      </div>

      <div className="panel reveal">
        <div className="panel-title" style={{ marginBottom: 8 }}>First: where our own results disagree, and why</div>
        <table className="data wrap">
          <thead><tr><th>Question</th><th>One answer</th><th>Another answer</th><th>Why they differ</th></tr></thead>
          <tbody>
            <tr>
              <td>Do we reproduce the paper?</td>
              <td>With the authors' own 2020 data snapshots: the same τ and lag for all 122 countries.</td>
              <td>With our cleaned panel: continent medians within about 0.02; a few countries differ.</td>
              <td>Johns Hopkins revised its case counts after 2020.</td>
            </tr>
            <tr>
              <td>How strong is the 2020 link?</td>
              <td>Paper's method: median τ {fmtTau(retailMed)} (retail).</td>
              <td>Fair measure: τ {fmtTau(fixedPeak.v)}, and fake country pairs score zero.</td>
              <td>Trending levels against growth with the shared daily trend removed. The sign flips because less movement is followed by slower growth.</td>
            </tr>
            <tr>
              <td>South America</td>
              <td>Paper's method: the exception, with positive τ and lags at +28 days.</td>
              <td>Fair measure: one of the strongest links.</td>
              <td>Its epidemic started later, which shared timing reads as an opposite relationship.</td>
            </tr>
            <tr>
              <td>Who moved first?</td>
              <td>Paper's method: Europe about {fmtLag(d.tests.ours.retail.lag.medians.EU ?? null)}, Africa about {fmtLag(d.tests.ours.retail.lag.medians.AF ?? null)}, a quarter at the ±28 edge.</td>
              <td>Fair measure: movement leads case growth by about {Math.abs(fixedPeak.lag)} days, pooled.</td>
              <td>Best of 57 lags per country against fixed lag windows tested against fake pairs.</td>
            </tr>
            {d.context && d.context.timing.length > 0 && (() => {
              const t = d.context.timing;
              const first = t.filter((r) => r.gap < 0).length;
              return (
                <tr>
                  <td>Did behaviour change before cases?</td>
                  <td>Lag-based answers say yes: the fair measure has movement leading case growth by about {Math.abs(fixedPeak.lag)} days.</td>
                  <td>A direct timing check says mostly no: mobility fell 20% before cases reached 1 per million in only {first} of {t.length} countries ({Math.round((100 * first) / t.length)}%).</td>
                  <td>Different questions. The lags describe how the two series move together over months; the timing check asks which crossed a line first in early 2020, and 1 case per million is reached very early.</td>
                </tr>
              );
            })()}
            <tr>
              <td>After 2020</td>
              <td>Raw correlation: median τ goes from {fmtTau(stats.ours.medTau)} to {fmtTau(stats.full.medTau)} ({info.short.toLowerCase()}); {stats.flips} of {stats.both} countries flip sign.</td>
              <td>Model: the link persists at about half strength ({pct(lpMain.beta)} → {pct(lpExt.beta)}) and arrives later.</td>
              <td>Later waves add trends the raw correlation can't separate; the model removes them with country and day effects.</td>
            </tr>
            <tr>
              <td>Does mobility help forecasting?</td>
              <td>Corrected paper models: much worse with mobility.</td>
              <td>Real-time test: no difference.</td>
              <td>An extrapolated date trend plus actual future mobility against only what was known on the day. Both reject the paper's "it helps".</td>
            </tr>
            <tr>
              <td>How many best lags hit the edge?</td>
              <td>{stats.ours.edge}% at ±27–28 days (our panel, {info.short.toLowerCase()}).</td>
              <td>29–38% at ±26 or more (the authors' snapshots).</td>
              <td>Different cut-offs and data versions; all far above the 7–11% expected by chance.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="speculation-banner reveal" role="note">
        <strong>These are hypotheses, not findings.</strong> Each needs proper testing with additional data before any conclusion can be
        drawn. Several of them happened at the same time, so our data alone can't tell them apart.
      </div>

      <div className="hypotheses">
        {hypotheses.map((h) => (
          <article key={h.title} className="hypothesis reveal">
            <div className="h-badges">
              <span className="spec-badge">Speculation</span>
              {h.ours && <span className="spec-badge alt">Applies to 2020 too</span>}
            </div>
            <h3>{h.title}</h3>
            <p className="h-idea">{h.idea}</p>
            <dl>
              <dt>If true, we'd expect</dt><dd>{h.expect}</dd>
              <dt>How to test it</dt><dd>{h.test}</dd>
            </dl>
          </article>
        ))}
      </div>
    </Section>
  );
}
