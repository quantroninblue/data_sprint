import { useEffect, useRef, useState } from "react";
import type { Series } from "./data";

const DAY = 86400000;

export const parseDate = (s: string) => new Date(s + "T00:00:00Z");
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

const fmtDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtMonth = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
export const formatDay = (d: Date) => fmtDay.format(d);
export const formatMonth = (d: Date) => fmtMonth.format(d);

export const fmtTau = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : (v < 0 ? "−" : v > 0 ? "+" : "") + Math.abs(v).toFixed(2);
export const fmtLag = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} d`;
export const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))}%`;
export const fmtNum = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "–" : v.toLocaleString("en-GB", { maximumFractionDigits: digits });
export const fmtP = (p: number) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);

export function flag(iso2: string) {
  if (!/^[A-Z]{2}$/.test(iso2)) return "";
  return String.fromCodePoint(...[...iso2].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Plain-language reading of a lag, using the paper's sign convention. */
export function lagMeaning(lag: number) {
  if (lag === 0) return "on the same day as cases";
  const d = Math.abs(lag);
  return lag < 0 ? `${d} day${d === 1 ? "" : "s"} before cases` : `${d} day${d === 1 ? "" : "s"} after cases`;
}

export function zscore(s: Series): Series {
  const v = s.filter((x): x is number => x !== null);
  if (v.length < 2) return s.map(() => null);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) || 1;
  return s.map((x) => (x === null ? null : (x - mean) / sd));
}

export function median(v: number[]) {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Trailing 7-day mean; null until a full week of values is available. */
export function rolling7(s: Series): Series {
  return s.map((_, i) => {
    if (i < 6) return null;
    let sum = 0;
    for (let k = i - 6; k <= i; k++) {
      const v = s[k];
      if (v === null) return null;
      sum += v;
    }
    return sum / 7;
  });
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Eases a number towards its target (used for the odometer readouts and the sliding curve). */
export function useTween(target: number, ms = 260, from?: number) {
  const [value, setValue] = useState(from ?? target);
  const current = useRef(from ?? target);
  useEffect(() => {
    if (prefersReducedMotion()) {
      current.current = target;
      setValue(target);
      return;
    }
    const start = current.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const eased = 1 - (1 - t) ** 3;
      current.current = start + (target - start) * eased;
      setValue(current.current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** Adds the "in" class to every .reveal element once it scrolls into view. */
export function useReveal(deps: unknown[]) {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".reveal:not(.in)")];
    if (prefersReducedMotion()) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Selected country, line and version live in the URL so a view can be shared as a link. */
export function readUrlState() {
  const q = new URLSearchParams(window.location.search);
  return { country: q.get("country") ?? undefined, line: q.get("line") ?? undefined, version: q.get("version") ?? undefined };
}

export function writeUrlState(country: string, line: string, version: string) {
  const q = new URLSearchParams(window.location.search);
  q.set("country", country);
  q.set("line", line);
  q.set("version", version);
  window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
}

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
