import { useState } from "react";
import { Masthead } from "./components/Chrome";
import { useData, type Cat, type Metric } from "./lib/data";
import { catVar, useThemeMode } from "./lib/theme";
import { Clusters } from "./sections/Clusters";
import { Continents } from "./sections/Continents";
import { CountrySection } from "./sections/Country";
import { LagExplorer } from "./sections/LagExplorer";
import { MapSection } from "./sections/MapSection";
import { Models } from "./sections/Models";
import { Overview } from "./sections/Overview";
import { OverTime } from "./sections/OverTime";

export default function App() {
  const { data, error } = useData();
  const [mode, setMode] = useThemeMode();
  const [iso, setIso] = useState("DE");
  const [cat, setCat] = useState<Cat>("retail");
  const [metric, setMetric] = useState<Metric>("tau");

  if (error) return <div className="loading">Couldn't load data: {error}</div>;
  if (!data) return <div className="loading">Loading the network…</div>;

  const ctx = { d: data, iso: data.byIso[iso] ? iso : data.meta.countries[0].iso2, setIso, cat, setCat, mode };

  return (
    <div style={{ ["--line" as string]: catVar(cat) }}>
      <Masthead
        countries={[...data.meta.countries].sort((a, b) => a.name.localeCompare(b.name))}
        iso={ctx.iso} setIso={setIso} cat={cat} setCat={setCat} mode={mode} setMode={setMode}
        preliminary={data.meta.preliminary}
      />
      <main>
        <Overview {...ctx} />
        <CountrySection {...ctx} />
        <LagExplorer {...ctx} />
        <MapSection {...ctx} metric={metric} setMetric={setMetric} />
        <Continents {...ctx} metric={metric} setMetric={setMetric} />
        <Clusters {...ctx} />
        <Models {...ctx} />
        <OverTime {...ctx} />
      </main>
      <footer>
        Data: Google COVID-19 Community Mobility Reports; Johns Hopkins CSSE via github.com/datasets/covid-19. Method after Sulyok M &amp;
        Walker M (2020), <em>Epidemiology &amp; Infection</em> 148, e284. {data.meta.notes}
      </footer>
    </div>
  );
}
