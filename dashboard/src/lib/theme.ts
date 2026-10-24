import { interpolateLab } from "d3-interpolate";
import { useEffect, useState } from "react";
import type { Cat, Continent } from "./data";

// The six mobility categories are the six "lines" of the transit map.
export const CATS: { key: Cat; label: string; short: string; mobility: boolean }[] = [
  { key: "retail", label: "Retail & recreation", short: "Retail", mobility: true },
  { key: "grocery", label: "Grocery & pharmacy", short: "Grocery", mobility: true },
  { key: "parks", label: "Parks", short: "Parks", mobility: false },
  { key: "transit", label: "Transit stations", short: "Transit", mobility: true },
  { key: "workplaces", label: "Workplaces", short: "Work", mobility: true },
  { key: "residential", label: "Residential", short: "Home", mobility: false },
];
export const CAT_BY_KEY = Object.fromEntries(CATS.map((c) => [c.key, c])) as Record<Cat, (typeof CATS)[number]>;
export const catVar = (c: Cat) => `var(--cat-${c})`;

export const CONTINENT_ORDER: Continent[] = ["AF", "AS", "EU", "OC", "SA", "NA"];
export const CONTINENT_SHORT: Record<Continent, string> = {
  AF: "Africa", AS: "Asia", EU: "Europe", OC: "Oceania", SA: "S. America", NA: "N. America",
};

export const CLUSTER_NAMES: Record<number, { name: string; blurb: string }> = {
  1: { name: "Early movers", blurb: "Mobility fell about four weeks before cases rose." },
  2: { name: "In step", blurb: "Strong negative link with almost no lag, mostly Western Europe, N. America and Australia." },
  3: { name: "Loosely coupled", blurb: "Weak correlation, with short lags." },
  4: { name: "Opposite track", blurb: "Mobility recovered while cases climbed, mostly S. America and Eastern Europe." },
};

export type ThemeMode = "light" | "dark";

export function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const read = (): ThemeMode => {
    const stamped = document.documentElement.dataset.theme;
    if (stamped === "light" || stamped === "dark") return stamped;
    return media?.matches ? "dark" : "light";
  };
  const [mode, setMode] = useState<ThemeMode>(read);
  useEffect(() => {
    const onChange = () => setMode(read());
    media?.addEventListener("change", onChange);
    return () => media?.removeEventListener("change", onChange);
  });
  const set = (m: ThemeMode) => {
    document.documentElement.dataset.theme = m;
    try {
      localStorage.setItem("theme", m);
    } catch {
      /* storage unavailable */
    }
    setMode(m);
  };
  return [mode, set];
}

// Diverging scales computed in Lab between the two poles and a neutral grey midpoint.
const POLES = {
  light: { tauNeg: "#184f95", tauPos: "#b52b2b", lagNeg: "#4a3aa7", lagPos: "#b06f00", mid: "#ebe8e0", none: "#dcd8cd" },
  dark: { tauNeg: "#5598e7", tauPos: "#e66767", lagNeg: "#9085e9", lagPos: "#d99a1e", mid: "#383835", none: "#262624" },
};

export function divergingColor(mode: ThemeMode, metric: "tau" | "lag", v: number | null | undefined) {
  const p = POLES[mode];
  if (v === null || v === undefined || Number.isNaN(v)) return p.none;
  const max = metric === "tau" ? 0.8 : 28;
  const t = Math.max(-1, Math.min(1, v / max));
  const neg = metric === "tau" ? p.tauNeg : p.lagNeg;
  const pos = metric === "tau" ? p.tauPos : p.lagPos;
  return t < 0 ? interpolateLab(p.mid, neg)(-t) : interpolateLab(p.mid, pos)(t);
}

export const noDataColor = (mode: ThemeMode) => POLES[mode].none;

export function gradientCss(mode: ThemeMode, metric: "tau" | "lag") {
  const max = metric === "tau" ? 0.8 : 28;
  const stops = Array.from({ length: 9 }, (_, i) => divergingColor(mode, metric, -max + (i * 2 * max) / 8));
  return `linear-gradient(90deg, ${stops.join(",")})`;
}
