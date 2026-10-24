import { useEffect, useState } from "react";

// Shapes of the JSON files in public/data. The R analysis should export the same shapes.
export type Cat = "retail" | "grocery" | "parks" | "transit" | "workplaces" | "residential";
export type Metric = "tau" | "lag";
export type Continent = "AF" | "AS" | "EU" | "OC" | "SA" | "NA";
export type Series = (number | null)[];

export interface Country { iso2: string; name: string; continent: Continent; numeric: string; pop: number }
export interface ClusterInfo { id: number; n: number; median_tau: number; median_lag: number; members: string[] }
export interface Meta {
  generated: string;
  preliminary: boolean;
  notes: string;
  start: string;
  end: string;
  paper_end: string;
  categories: Cat[];
  lags: number[];
  continents: Record<Continent, string>;
  countries: Country[];
  rolling: { window_days: number; step_days: number; starts: string[] };
  clusters: ClusterInfo[];
}
export interface Panel {
  countries: Record<string, { cases: Series; mob: Record<Cat, Series> }>;
  world: { cases: Series; mob: Record<Cat, Series> };
}
export type Ccf = Record<string, Record<Cat, Series>>;
export interface SummaryRow {
  iso2: string;
  continent: Continent;
  cluster?: number;
  tau: Record<Cat, number | null>;
  lag: Record<Cat, number | null>;
}
export interface MetricTest {
  kw_h: number;
  kw_p: number;
  medians: Partial<Record<Continent, number>>;
  iqr: Partial<Record<Continent, [number, number]>>;
  dunn: { a: Continent; b: Continent; z: number; p_adj: number }[];
}
export type ContinentTests = Record<Cat, Record<Metric, MetricTest>>;
export type Rolling = Record<string, Record<Cat, { tau: (number | null)[]; lag: (number | null)[] }>>;
export type ModelKey = "date" | "mobility" | "lagged";
export interface Models {
  simulated_forecasts: boolean;
  train_end: string;
  valid_start: string;
  valid_end: string;
  paper: {
    bic: Record<ModelKey, number>;
    rmse: Record<ModelKey, number>;
    coefficients: { term: string; estimate: number; se: number; p: number }[];
  };
  predictions: Record<string, { observed: Series } & Record<ModelKey, Series>>;
}

export interface Data {
  meta: Meta;
  panel: Panel;
  ccf: Ccf;
  summary: SummaryRow[];
  tests: ContinentTests;
  rolling: Rolling;
  models: Models;
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
    ])
      .then(([meta, panel, ccf, summary, tests, rolling, models]) =>
        setData({
          meta, panel, ccf, summary, tests, rolling, models,
          byIso: Object.fromEntries(meta.countries.map((c) => [c.iso2, c])),
          summaryByIso: Object.fromEntries(summary.map((s) => [s.iso2, s])),
        }),
      )
      .catch((e: Error) => setError(e.message));
  }, []);
  return { data, error };
}
