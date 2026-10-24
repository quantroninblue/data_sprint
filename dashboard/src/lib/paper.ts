import type { Cat, Continent } from "./data";

// Published continent medians from Sulyok & Walker (2020), Tables 1 and 2.
export const PAPER_TAU: Record<Cat, Record<Continent, number>> = {
  retail: { AF: -0.35, AS: -0.46, EU: -0.63, OC: -0.51, SA: 0.33, NA: -0.38 },
  grocery: { AF: -0.31, AS: -0.4, EU: -0.51, OC: -0.46, SA: 0.29, NA: -0.38 },
  parks: { AF: -0.39, AS: -0.49, EU: -0.34, OC: -0.4, SA: -0.02, NA: -0.38 },
  transit: { AF: -0.35, AS: -0.42, EU: -0.65, OC: -0.51, SA: 0.37, NA: -0.37 },
  workplaces: { AF: -0.32, AS: -0.47, EU: -0.58, OC: -0.5, SA: 0.34, NA: -0.37 },
  residential: { AF: 0.4, AS: 0.53, EU: 0.57, OC: 0.42, SA: -0.31, NA: 0.36 },
};

export const PAPER_LAG: Record<Cat, Record<Continent, number>> = {
  retail: { AF: -22.5, AS: -2, EU: 2, OC: 8.5, SA: 27, NA: 1.5 },
  grocery: { AF: -19, AS: -1, EU: 3, OC: 9, SA: 27, NA: -3 },
  parks: { AF: -1.5, AS: -12, EU: -0.5, OC: 9, SA: 14, NA: -7 },
  transit: { AF: -4, AS: 2.5, EU: 1.5, OC: 8, SA: 27.5, NA: -5.5 },
  workplaces: { AF: -16.5, AS: -2, EU: 3.5, OC: 9, SA: 28, NA: -3 },
  residential: { AF: -15, AS: -4, EU: -0.5, OC: 5, SA: 26.5, NA: 1 },
};

export const PAPER_N: Record<Continent, number> = { AF: 24, AS: 32, EU: 36, OC: 4, SA: 10, NA: 16 };

export const MODEL_LABELS: Record<"date" | "mobility" | "lagged", string> = {
  date: "Date only",
  mobility: "+ Same-day mobility",
  lagged: "+ Lagged mobility (±14 d)",
};
