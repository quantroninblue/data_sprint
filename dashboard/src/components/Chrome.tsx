import { useEffect, useState, type ReactNode } from "react";
import type { Cat, Country, Version } from "../lib/data";
import { CATS, catVar, VERSIONS, type ThemeMode } from "../lib/theme";
import { flag } from "../lib/util";

export const STOPS = [
  { id: "overview", label: "Overview" },
  { id: "country", label: "Country" },
  { id: "lag", label: "Lag explorer" },
  { id: "map", label: "World map" },
  { id: "continents", label: "Continents" },
  { id: "fair", label: "Fair test" },
  { id: "clusters", label: "Clusters" },
  { id: "models", label: "Models" },
  { id: "over-time", label: "Over time" },
  { id: "why", label: "Why it changed" },
] as const;

function useActiveStop() {
  const [active, setActive] = useState<string>(STOPS[0].id);
  useEffect(() => {
    const els = STOPS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return active;
}

interface MastheadProps {
  countries: Country[];
  iso: string;
  setIso: (iso: string) => void;
  cat: Cat;
  setCat: (c: Cat) => void;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  version: Version;
  setVersion: (v: Version) => void;
}

/** Presentation mode: each stop fills the screen and the arrow keys move between stops. */
function usePresenting(activeIdx: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("presenting", on);
    if (!on) return;
    const go = (i: number) => document.getElementById(STOPS[Math.max(0, Math.min(STOPS.length - 1, i))].id)?.scrollIntoView({ behavior: "smooth" });
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(activeIdx + 1); }
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); go(activeIdx - 1); }
      else if (e.key === "Home") { e.preventDefault(); go(0); }
      else if (e.key === "End") { e.preventDefault(); go(STOPS.length - 1); }
      else if (e.key === "Escape") setOn(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on, activeIdx]);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setOn(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      if (next && !document.fullscreenElement) void document.documentElement.requestFullscreen?.();
      if (!next && document.fullscreenElement) void document.exitFullscreen();
    } catch {
      /* fullscreen not allowed; presenting still works in the window */
    }
  };
  return [on, toggle] as const;
}

export function Masthead({ countries, iso, setIso, cat, setCat, mode, setMode, version, setVersion }: MastheadProps) {
  const active = useActiveStop();
  const activeIdx = STOPS.findIndex((s) => s.id === active);
  const [presenting, togglePresenting] = usePresenting(activeIdx);
  const current = countries.find((c) => c.iso2 === iso);
  const [text, setText] = useState(current?.name ?? "");
  useEffect(() => setText(current?.name ?? ""), [current]);

  const commit = (v: string) => {
    const hit = countries.find((c) => c.name.toLowerCase() === v.trim().toLowerCase());
    if (hit) setIso(hit.iso2);
  };

  return (
    <header className="masthead">
      <div className="masthead-inner">
        <div className="mast-top">
          <div className="wordmark">Moving Less <span>· mobility &amp; COVID-19</span></div>
          <div className="spacer" />
          {presenting && <span className="small present-hint">← → to change stop · Esc to exit</span>}
          <button className="present-btn" onClick={togglePresenting} aria-pressed={presenting}>
            {presenting ? "Exit" : "Present"}
          </button>
          <button
            className="icon-btn"
            aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => setMode(mode === "dark" ? "light" : "dark")}
          >
            {mode === "dark" ? "☀" : "☾"}
          </button>
        </div>
        <nav className="metro" aria-label="Sections">
          <ol>
            {STOPS.map((s, i) => (
              <li key={s.id} className={i < activeIdx ? "passed" : i === activeIdx ? "active" : ""}>
                <button onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" })} aria-current={i === activeIdx ? "step" : undefined}>
                  <span className="stop" />
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="filters">
          <label className="country-pick">
            <span className="filter-label">Country</span>
            <span aria-hidden>{flag(iso)}</span>
            <input
              list="country-list" value={text}
              placeholder={`Search ${countries.length} countries`}
              // Clear on focus so the suggestion list shows every country, not just the current one.
              onFocus={() => setText("")}
              onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
              onBlur={() => setText(countries.find((c) => c.iso2 === iso)?.name ?? "")}
              onKeyDown={(e) => { if (e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
              aria-label="Choose a country"
              title="Type to search, or click a country on any map"
            />
            <datalist id="country-list">
              {countries.map((c) => <option key={c.iso2} value={c.name} />)}
            </datalist>
          </label>
          <div className="country-pick">
            <span className="filter-label">Version</span>
            <Seg label="Results version" value={version} onChange={setVersion} options={VERSIONS.map((v) => ({ value: v.key, label: v.label }))} />
          </div>
          <div className="lines" role="group" aria-label="Mobility category">
            <span className="filter-label" style={{ alignSelf: "center", marginRight: 4 }}>Line</span>
            {CATS.map((c) => (
              <button key={c.key} className="line-chip" aria-pressed={c.key === cat} style={{ ["--c" as string]: catVar(c.key) }} onClick={() => setCat(c.key)}>
                <span className="roundel" />
                {c.short}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

export function Section({ id, n, title, dek, children }: { id: string; n: number; title: ReactNode; dek?: ReactNode; children: ReactNode }) {
  const label = STOPS.find((s) => s.id === id)?.label;
  return (
    <section className="section" id={id}>
      <div className="reveal">
        <div className="kicker"><span className="stop" />Stop {n} · {label}</div>
        <h2>{title}</h2>
        {dek && <p className="dek">{dek}</p>}
      </div>
      {children}
    </section>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function TableView({ label = "Show table", children }: { label?: string; children: ReactNode }) {
  return (
    <details className="table-view">
      <summary>{label}</summary>
      <div className="scroll">{children}</div>
    </details>
  );
}
