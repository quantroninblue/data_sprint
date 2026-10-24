import { useEffect, useState } from "react";

// Shapes of the JSON files in public/data. The R analysis should export the same shapes.
export type Cat = "retail" | "grocery" | "parks" | "transit" | "workplaces" | "residential";
export type Metric = "tau" | "lag";
export type Continent = "AF" | "AS" | "EU" | "OC" | "SA" | "NA";
export type Series = (number | null)[];

/** published = the paper's own numbers; ours = our replication (2020); full = ours over 2020–22. */
export type Version = "published" | "ours" | "full";
export type ClusterType = "instep" | "loose" | "early" | "opposite";
export type ModelKey = "date" | "mobility" | "lagged";
export type ModelVersion = "paper" | "replication" | "corrected";

export interface Country { iso2: string; name: string; continent: Continent; numeric: string; pop: number; in_paper: boolean }
export interface ClusterProfile { id: number; type: ClusterType; n: number; median_tau: number; median_lag: number; examples?: string }
export interface Meta {
  generated: string;
  start: string;
  end: string;
  paper_end: string;
  categories: Cat[];
  lags: number[];
  continents: Record<Continent, string>;
  countries: Country[];
  rolling: { window_days: number; step_days: number; starts: string[] };
  clusters: Record<"published" | "replication" | "corrected", ClusterProfile[]>;
}
export interface Panel {
  countries: Record<string, { cases: Series; mob: Record<Cat, Series> }>;
  world: { cases: Series; mob: Record<Cat, Series> };
}
export type Ccf = Record<"ours" | "full", Record<string, Record<Cat, Series>>>;
export interface Best { tau: Record<Cat, number | null>; lag: Record<Cat, number | null> }
export interface SummaryRow {
  iso2: string;
  continent: Continent;
  published: Best | null;
  ours: Best | null;
  full: Best | null;
  cluster: { published: ClusterType | null; corrected: ClusterType | null };
}
export interface MetricTest {
  kw_h: number;
  kw_p: number;
  medians: Partial<Record<Continent, number>>;
  iqr: Partial<Record<Continent, [number, number]>>;
  dunn: { a: Continent; b: Continent; z: number; p_adj: number }[];
}
export type ContinentTests = Record<"ours" | "full", Record<Cat, Record<Metric, MetricTest>>>;
export type Rolling = Record<string, Record<Cat, { tau: (number | null)[]; lag: (number | null)[] }>>;
export interface Models {
  bic: Record<ModelKey, Record<ModelVersion, number>>;
  rmse: Record<ModelKey, Record<ModelVersion, number>>;
  median_country_rmse_per_million: Record<ModelKey, number>;
  diebold_mariano: { version: string; comparison: string; statistic: number; p: number }[];
  table3_replication: { term: string; estimate: number; se: number; p: number }[];
  table3_corrected: { term: string; edf: number; F: number; p: number }[];
  paper_vs_replication: { item: string; paper: string; replication: string; corrected: string }[];
}

export interface ProfilePoint { lag: number; v: number; lo: number; hi: number }
export interface LpPoint { h: number; beta: number; lo: number; hi: number }
export interface FixedCountry {
  iso2: string; continent: Continent; n_days: number;
  tau_transmission: number; q_transmission: number; tau_behaviour: number; q_behaviour: number;
}
/** The reanalysis: placebo pairs, the fixed correlation, local projections and real-time forecasts. */
export interface FairTest {
  paper_profile: Record<"real" | "placebo", ProfilePoint[]>;
  placebo: { real: Partial<Record<Cat, number[]>>; fake: Partial<Record<Cat, number[]>> };
  profiles: Record<"main" | "full", Record<string, Record<"real" | "placebo", ProfilePoint[]>>>;
  countries: Record<"main" | "full", FixedCountry[]>;
  lp: Record<"main" | "full" | "ext", Record<"transmission" | "behaviour", Record<string, LpPoint[]>>>;
  forecast: { scores: Record<string, { validation: number; test: number }>; horizons: Record<string, number>[] };
}

/** Lockdown-wave heatmap, who-moved-first timing and lockdown styles (optional file). */
export interface ContextData {
  heat: { start: string; countries: Record<string, { continent: Continent; mob: Series }> };
  timing: { iso2: string; continent: Continent; mob_drop: string; case_1pm: string; gap: number }[];
  styles: { iso2: string; style: string; weekly: Series }[];
  style_order: string[];
  stationarity: Record<string, string> | null;
}

/** One country's strongest tau and lag per category, in the chosen version. */
export const bestOf = (row: SummaryRow | undefined, v: Version): Best | null => (row ? row[v] : null);

export interface Data {
  meta: Meta;
  panel: Panel;
  ccf: Ccf;
  summary: SummaryRow[];
  tests: ContinentTests;
  rolling: Rolling;
  models: Models;
  fair: FairTest;
  context: ContextData | null;
  byIso: Record<string, Country>;
  summaryByIso: Record<string, SummaryRow>;
}

const base = import.meta.env.BASE_URL + "data/";
const get = <T,>(f: string): Promise<T> =>
  fetch(base + f).then((r) => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.json() as Promise<T>;
  });

export function useData() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([
      get<Meta>("meta.json"),
      get<Panel>("panel.json"),
      get<Ccf>("ccf.json"),
      get<SummaryRow[]>("summary.json"),
      get<ContinentTests>("continent_tests.json"),
      get<Rolling>("rolling.json"),
      get<Models>("models.json"),
      get<FairTest>("fairtest.json"),
      get<ContextData>("context.json").catch(() => null),
    ])
      .then(([meta, panel, ccf, summary, tests, rolling, models, fair, context]) =>
        setData({
          meta, panel, ccf, summary, tests, rolling, models, fair, context,
          byIso: Object.fromEntries(meta.countries.map((c) => [c.iso2, c])),
          summaryByIso: Object.fromEntries(summary.map((s) => [s.iso2, s])),
        }),
      )
      .catch((e: Error) => setError(e.message));
  }, []);
  return { data, error };
}
