import { useState, useMemo, useCallback, useRef, useEffect } from "react";

interface SunburstNode {
  name: string;
  value?: number;
  children?: SunburstNode[];
}

interface ArcData {
  node: SunburstNode;
  depth: number;
  startAngle: number;
  endAngle: number;
  value: number;
  path: string[];
}

const KINGDOM_COLORS: Record<string, string> = {
  Animalia: "#2d6a4f",
  Plantae: "#588157",
  Fungi: "#a68a64",
  Chromista: "#457b9d",
  Bacteria: "#e76f51",
  Protozoa: "#8338ec",
  Archaea: "#f77f00",
  Orthornavirae: "#d62828",
};

function getColor(path: string[], depth: number): string {
  const kingdom = path[0] || "";
  const base = KINGDOM_COLORS[kingdom] || "#64748b";
  if (depth === 0) return base;

  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);

  const lightness = depth === 1 ? 0.25 : 0.45;
  const nr = Math.round(r + (255 - r) * lightness);
  const ng = Math.round(g + (255 - g) * lightness);
  const nb = Math.round(b + (255 - b) * lightness);
  return `rgb(${nr},${ng},${nb})`;
}

function nodeValue(node: SunburstNode): number {
  if (node.value != null) return node.value;
  return (node.children || []).reduce((s, c) => s + nodeValue(c), 0);
}

function flattenArcs(
  node: SunburstNode,
  depth: number,
  startAngle: number,
  endAngle: number,
  path: string[],
  maxDepth: number
): ArcData[] {
  if (depth > maxDepth) return [];

  const arcs: ArcData[] = [];
  const val = nodeValue(node);

  if (depth > 0) {
    arcs.push({
      node,
      depth,
      startAngle,
      endAngle,
      value: val,
      path: [...path],
    });
  }

  if (node.children && node.children.length > 0 && depth < maxDepth) {
    const total = node.children.reduce((s, c) => s + nodeValue(c), 0);
    let angle = startAngle;
    for (const child of node.children) {
      const childVal = nodeValue(child);
      const childEnd = angle + ((endAngle - startAngle) * childVal) / total;
      const childPath = [...path, child.name];
      arcs.push(
        ...flattenArcs(child, depth + 1, angle, childEnd, childPath, maxDepth)
      );
      angle = childEnd;
    }
  }

  return arcs;
}

function describeArc(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  const clampedEnd = Math.min(endAngle, startAngle + Math.PI * 2 - 0.001);
  const x1 = cx + outerR * Math.cos(startAngle);
  const y1 = cy + outerR * Math.sin(startAngle);
  const x2 = cx + outerR * Math.cos(clampedEnd);
  const y2 = cy + outerR * Math.sin(clampedEnd);
  const x3 = cx + innerR * Math.cos(clampedEnd);
  const y3 = cy + innerR * Math.sin(clampedEnd);
  const x4 = cx + innerR * Math.cos(startAngle);
  const y4 = cy + innerR * Math.sin(startAngle);

  const large = clampedEnd - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

function arcLabel(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  text: string,
  maxWidth: number
): { x: number; y: number; rotate: number; text: string; visible: boolean } {
  const angle = (startAngle + endAngle) / 2;
  const span = endAngle - startAngle;
  if (span < 0.08) return { x: 0, y: 0, rotate: 0, text: "", visible: false };

  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);

  let rotate = (angle * 180) / Math.PI;
  if (rotate > 90 && rotate < 270) rotate += 180;
  if (rotate > 270) rotate -= 360;

  const maxChars = Math.max(3, Math.floor((span * r) / 7));
  const truncated =
    text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;

  return { x, y, rotate, text: truncated, visible: true };
}

interface Props {
  data: SunburstNode;
  size?: number;
}

export function TaxonomySunburst({ data, size = 500 }: Props) {
  const [hoveredPath, setHoveredPath] = useState<string[] | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    name: string;
    value: number;
    path: string[];
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const cx = size / 2;
  const cy = size / 2;
  const maxDepth = 3;
  const ringWidth = size * 0.13;
  const innerRadius = size * 0.1;

  const arcs = useMemo(
    () => flattenArcs(data, 0, -Math.PI / 2, (3 * Math.PI) / 2, [], maxDepth),
    [data, maxDepth]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, arc: ArcData) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        name: arc.node.name,
        value: arc.value,
        path: arc.path,
      });
      setHoveredPath(arc.path);
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    setHoveredPath(null);
  }, []);

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-auto max-w-[500px] mx-auto"
      >
        {arcs.map((arc, i) => {
          const ir = innerRadius + (arc.depth - 1) * ringWidth;
          const or_ = ir + ringWidth - 1;
          const d = describeArc(cx, cy, ir, or_, arc.startAngle, arc.endAngle);
          const color = getColor(arc.path, arc.depth - 1);

          const isHovered =
            hoveredPath &&
            arc.path.length <= hoveredPath.length &&
            arc.path.every((p, idx) => hoveredPath[idx] === p);
          const isDimmed = hoveredPath && !isHovered;

          return (
            <path
              key={i}
              d={d}
              fill={color}
              stroke="white"
              strokeWidth={1.5}
              opacity={isDimmed ? 0.3 : 1}
              className="transition-opacity duration-200 cursor-pointer"
              onMouseMove={(e) => handleMouseMove(e, arc)}
              onMouseLeave={handleMouseLeave}
            />
          );
        })}

        {arcs
          .filter((a) => a.depth === 1)
          .map((arc, i) => {
            const r = innerRadius + ringWidth * 0.5;
            const label = arcLabel(
              cx,
              cy,
              r,
              arc.startAngle,
              arc.endAngle,
              arc.node.name,
              ringWidth
            );
            if (!label.visible) return null;
            return (
              <text
                key={`label-${i}`}
                x={label.x}
                y={label.y}
                transform={`rotate(${label.rotate},${label.x},${label.y})`}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-white font-semibold pointer-events-none"
                style={{ fontSize: Math.min(12, size * 0.024) }}
              >
                {label.text}
              </text>
            );
          })}

        <circle cx={cx} cy={cy} r={innerRadius - 2} fill="var(--background)" />
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          className="fill-foreground font-serif font-bold"
          style={{ fontSize: size * 0.038 }}
        >
          {hoveredPath
            ? hoveredPath[hoveredPath.length - 1]
            : data.children
              ? data.children.reduce((s, c) => s + nodeValue(c), 0).toLocaleString("fr-FR")
              : ""}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: size * 0.022 }}
        >
          {hoveredPath
            ? `${tooltip?.value?.toLocaleString("fr-FR") || ""} especes`
            : "especes"}
        </text>
      </svg>

      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-sm"
          style={{
            left: Math.min(tooltip.x + 12, size - 180),
            top: tooltip.y - 50,
          }}
        >
          <div className="font-semibold text-foreground">{tooltip.name}</div>
          <div className="text-muted-foreground text-xs">
            {tooltip.value.toLocaleString("fr-FR")} especes
          </div>
          <div className="text-muted-foreground/60 text-[10px] mt-0.5">
            {tooltip.path.join(" › ")}
          </div>
        </div>
      )}
    </div>
  );
}
