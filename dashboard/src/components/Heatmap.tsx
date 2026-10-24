import { useEffect, useMemo, useRef, useState } from "react";
import type { Continent, Series } from "../lib/data";
import { CONTINENT_SHORT, type ThemeMode, divergingColor } from "../lib/theme";
import { addDays, fmtPct, formatDay, useWidth } from "../lib/util";

export interface HeatRow { iso2: string; name: string; continent: Continent; values: Series }

interface Props {
  rows: HeatRow[]; // already sorted, grouped by continent
  start: Date;
  marker?: { i: number; label: string };
  mode: ThemeMode;
  selected?: string;
  onSelect?: (iso2: string) => void;
}

const ROW = 4;
const GAP = 10; // space between continent groups
const LEFT = 86;

/** Country × day grid of the mobility index, drawn on a canvas (about 17,000 cells). */
export function Heatmap({ rows, start, marker, mode, selected, onSelect }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ r: number; i: number; x: number; y: number } | null>(null);
  const days = rows[0]?.values.length ?? 0;
  const innerW = Math.max(0, width - LEFT - 8);
  const cell = innerW / Math.max(1, days);

  // y position of each row, with a gap before each new continent
  const { ys, groups, height } = useMemo(() => {
    const ys: number[] = [];
    const groups: { c: Continent; y0: number; y1: number }[] = [];
    let y = 18;
    rows.forEach((r, k) => {
      if (k === 0 || rows[k - 1].continent !== r.continent) {
        if (k > 0) y += GAP;
        groups.push({ c: r.continent, y0: y, y1: y });
      }
      ys.push(y);
      y += ROW;
      groups[groups.length - 1].y1 = y;
    });
    return { ys, groups, height: y + 24 };
  }, [rows]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !width) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, height);
    rows.forEach((r, k) => {
      r.values.forEach((v, i) => {
        g.fillStyle = divergingColor(mode, "tau", v === null ? null : Math.max(-1, Math.min(1, v / 80)) * 0.8);
        g.fillRect(LEFT + i * cell, ys[k], Math.ceil(cell), ROW - 0.5);
      });
    });
    if (marker) {
      const css = getComputedStyle(c);
      g.strokeStyle = css.getPropertyValue("--ink").trim() || "#000";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(LEFT + marker.i * cell + 0.5, 14);
      g.lineTo(LEFT + marker.i * cell + 0.5, height - 20);
      g.stroke();
    }
  }, [rows, width, height, cell, mode, marker, ys]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - b.left, py = e.clientY - b.top;
    const i = Math.floor((px - LEFT) / cell);
    const r = ys.findIndex((yy) => py >= yy && py < yy + ROW);
    setHover(i >= 0 && i < days && r >= 0 ? { r, i, x: px, y: py } : null);
  };

  const selIdx = rows.findIndex((r) => r.iso2 === selected);
  const ticks = [0, 15, 30, 46, 61, 76, 91, 107, 122].filter((i) => i < days);

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <>
          <canvas
            ref={canvas} style={{ width, height, cursor: "pointer" }} role="img"
            aria-label="Heatmap of the mobility index by country and day"
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}
            onClick={() => hover && onSelect?.(rows[hover.r].iso2)}
          />
          <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {groups.map((gp) => (
              <text key={gp.c} x={LEFT - 8} y={(gp.y0 + gp.y1) / 2} dy="0.32em" textAnchor="end" className="direct-label">{CONTINENT_SHORT[gp.c]}</text>
            ))}
            {marker && <text x={LEFT + marker.i * cell + 6} y={11} className="annot-strong">{marker.label}</text>}
            {ticks.map((i) => (
              <text key={i} x={LEFT + i * cell} y={height - 6} className="annot" textAnchor="middle">
                {addDays(start, i).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
              </text>
            ))}
            {selIdx >= 0 && <rect x={LEFT - 1} y={ys[selIdx] - 1} width={innerW + 2} height={ROW + 1} fill="none" stroke="var(--ink)" strokeWidth={1.5} />}
          </svg>
        </>
      )}
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div className="t-head">{rows[hover.r].name} · {formatDay(addDays(start, hover.i))}</div>
          <div className="t-row"><span className="t-val">{fmtPct(rows[hover.r].values[hover.i])}</span><span>mobility index vs baseline</span></div>
        </div>
      )}
    </div>
  );
}
