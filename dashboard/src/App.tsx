import { useEffect, useState } from "react";
import { Masthead } from "./components/Chrome";
import { useData, type Cat, type Metric, type Version } from "./lib/data";
import { CAT_BY_KEY, catVar, useThemeMode, VERSION_BY_KEY } from "./lib/theme";
import { readUrlState, useReveal, writeUrlState } from "./lib/util";
import { Clusters } from "./sections/Clusters";
import { Continents } from "./sections/Continents";
import { FairTest } from "./sections/FairTest";
import { CountrySection } from "./sections/Country";
import { LagExplorer } from "./sections/LagExplorer";
import { MapSection } from "./sections/MapSection";
import { Models } from "./sections/Models";
import { Overview } from "./sections/Overview";
import { OverTime } from "./sections/OverTime";
import { WhyChanged } from "./sections/WhyChanged";

export default function App() {
  const { data, error } = useData();
  const [mode, setMode] = useThemeMode();
  const initial = readUrlState();
  const [iso, setIso] = useState(initial.country ?? "DE");
  const [cat, setCat] = useState<Cat>(initial.line && initial.line in CAT_BY_KEY ? (initial.line as Cat) : "retail");
  const [version, setVersion] = useState<Version>(initial.version && initial.version in VERSION_BY_KEY ? (initial.version as Version) : "ours");
  const [metric, setMetric] = useState<Metric>("tau");
  useReveal([data]);
  useEffect(() => {
    if (data) writeUrlState(data.byIso[iso] ? iso : data.meta.countries[0].iso2, cat, version);
  }, [data, iso, cat, version]);

  if (error) return <div className="loading">Couldn't load data: {error}</div>;
  if (!data) return <div className="loading">Loading the network…</div>;

  const ctx = { d: data, iso: data.byIso[iso] ? iso : data.meta.countries[0].iso2, setIso, cat, setCat, version, setVersion, mode };

  return (
    <div style={{ ["--line" as string]: catVar(cat) }}>
      <Masthead
        countries={[...data.meta.countries].sort((a, b) => a.name.localeCompare(b.name))}
        iso={ctx.iso} setIso={setIso} cat={cat} setCat={setCat} mode={mode} setMode={setMode}
        version={version} setVersion={setVersion}
      />
      <main>
        <Overview {...ctx} />
        <CountrySection {...ctx} />
        <LagExplorer {...ctx} />
        <MapSection {...ctx} metric={metric} setMetric={setMetric} />
        <Continents {...ctx} metric={metric} setMetric={setMetric} />
        <FairTest {...ctx} />
        <Clusters {...ctx} />
        <Models {...ctx} />
        <OverTime {...ctx} />
        <WhyChanged {...ctx} />
      </main>
      <footer>
        Data: Google COVID-19 Community Mobility Reports; Johns Hopkins CSSE via github.com/datasets/covid-19. Method after Sulyok M &amp;
        Walker M (2020), <em>Epidemiology &amp; Infection</em> 148, e284. "Paper" values come from the paper and its supplementary
        material; "Ours" is our team's replication. The rolling-window view is a preliminary extension.
      </footer>
    </div>
  );
}
