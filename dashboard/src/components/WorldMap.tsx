import { geoEqualEarth, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useMemo, useState, type ReactNode } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { useWidth } from "../lib/util";

type CountryFeature = Feature<Geometry, { name: string }>;

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const FEATURES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features.filter(
  (f) => f.id !== "010", // Antarctica
) as CountryFeature[];

interface Props {
  numericToIso: Record<string, string>;
  fill: (iso2: string | undefined) => string;
  selected?: string;
  highlight?: Set<string> | null;
  onSelect?: (iso2: string) => void;
  tooltip?: (iso2: string | undefined, name: string) => ReactNode;
  ariaLabel: string;
  compact?: boolean;
}

export function WorldMap({ numericToIso, fill, selected, highlight, onSelect, tooltip, ariaLabel, compact }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ iso?: string; name: string; x: number; y: number } | null>(null);
  const height = Math.round(width * 0.47);

  const paths = useMemo(() => {
    if (!width) return [];
    const projection = geoEqualEarth().fitExtent([[2, 2], [width - 2, height - 2]], { type: "FeatureCollection", features: FEATURES });
    const path = geoPath(projection);
    return FEATURES.map((f) => ({ id: String(f.id), name: f.properties.name, d: path(f) ?? "" }));
  }, [width, height]);

  return (
    <div className="chart" ref={ref} style={{ height: height || undefined }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {paths.map((p) => {
            const iso = numericToIso[p.id];
            const dim = highlight && (!iso || !highlight.has(iso));
            const isSel = iso && iso === selected;
            return (
              <path
                key={p.id}
                d={p.d}
                fill={fill(iso)}
                opacity={dim ? 0.22 : 1}
                stroke={isSel ? "var(--ink)" : "var(--surface)"}
                strokeWidth={isSel ? 1.6 : compact ? 0.4 : 0.6}
                style={{ cursor: iso && onSelect ? "pointer" : "default", transition: "fill 0.35s, opacity 0.25s" }}
                onPointerMove={(e) => {
                  if (compact) return;
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({ iso, name: p.name, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onPointerLeave={() => setHover(null)}
                onClick={() => iso && onSelect?.(iso)}
              />
            );
          })}
          {selected && paths.filter((p) => numericToIso[p.id] === selected).map((p) => (
            <path key="sel" d={p.d} fill="none" stroke="var(--ink)" strokeWidth={1.6} pointerEvents="none" />
          ))}
        </svg>
      )}
      {hover && tooltip && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          {tooltip(hover.iso, hover.name)}
        </div>
      )}
    </div>
  );
}
