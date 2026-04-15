import { useState, useMemo, useCallback } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronLeft } from "lucide-react";

interface TreeNode {
  name: string;
  value?: number;
  children?: TreeNode[];
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

function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.round(r + (255 - r) * amount);
  const ng = Math.round(g + (255 - g) * amount);
  const nb = Math.round(b + (255 - b) * amount);
  return `rgb(${nr},${ng},${nb})`;
}

function nodeValue(node: TreeNode): number {
  if (node.value != null) return node.value;
  return (node.children || []).reduce((s, c) => s + nodeValue(c), 0);
}

function getColorForItem(name: string, parentName?: string): string {
  if (KINGDOM_COLORS[name]) return KINGDOM_COLORS[name];
  if (parentName && KINGDOM_COLORS[parentName]) {
    const base = KINGDOM_COLORS[parentName];
    const hash = name.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const variation = (Math.abs(hash) % 30) / 100;
    return lighten(base, 0.15 + variation);
  }
  return "#64748b";
}

interface CustomContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  value?: number;
  realValue?: number;
  depth?: number;
  root?: any;
  parentName?: string;
  onDrillDown?: (name: string) => void;
}

function CustomContent(props: CustomContentProps) {
  const { x = 0, y = 0, width = 0, height = 0, name = "", value = 0, realValue, depth, root, parentName, onDrillDown } = props;
  const displayValue = realValue ?? value;

  if (width < 4 || height < 4) return null;

  const color = getColorForItem(name, parentName);
  const showLabel = width > 40 && height > 24;
  const showValue = width > 60 && height > 44;
  const fontSize = Math.min(22, Math.max(10, Math.min(width / 6, height / 4)));
  const valueFontSize = Math.max(10, fontSize * 0.7);
  const gap = fontSize * 0.9;
  const fontStack = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        stroke="white"
        strokeWidth={2}
        rx={4}
        className="cursor-pointer transition-opacity hover:opacity-90"
        onClick={() => onDrillDown?.(name)}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showValue ? gap / 2 : 0)}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontWeight="700"
          fontSize={fontSize}
          fontFamily={fontStack}
          letterSpacing="0.02em"
          className="pointer-events-none select-none"
        >
          {name.length > Math.floor(width / (fontSize * 0.55))
            ? name.slice(0, Math.floor(width / (fontSize * 0.55)) - 1) + "…"
            : name}
        </text>
      )}
      {showValue && (
        <text
          x={x + width / 2}
          y={y + height / 2 + gap / 2 + 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(255,255,255,0.75)"
          fontSize={valueFontSize}
          fontFamily={fontStack}
          fontWeight="400"
          className="pointer-events-none select-none"
        >
          {displayValue.toLocaleString("fr-FR")}
        </text>
      )}
    </g>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <div className="font-semibold text-foreground">{data.name}</div>
      <div className="text-muted-foreground text-xs">
        {(data.realValue || data.value || 0).toLocaleString("fr-FR")} especes
      </div>
    </div>
  );
}

interface Props {
  data: TreeNode;
}

export function TaxonomyTreemap({ data }: Props) {
  const [path, setPath] = useState<string[]>([]);

  const currentNode = useMemo(() => {
    let node = data;
    for (const segment of path) {
      const child = node.children?.find((c) => c.name === segment);
      if (!child) break;
      node = child;
    }
    return node;
  }, [data, path]);

  const treemapData = useMemo(() => {
    if (!currentNode.children) return [];
    const raw = currentNode.children
      .map((child) => ({
        name: child.name,
        realValue: nodeValue(child),
        parentName: path.length > 0 ? path[0] : child.name,
        hasChildren: !!child.children && child.children.length > 0,
      }))
      .sort((a, b) => b.realValue - a.realValue);
    const maxVal = raw[0]?.realValue || 1;
    const minDisplay = maxVal * 0.04;
    return raw.map((item) => ({
      ...item,
      value: Math.max(item.realValue, minDisplay),
    }));
  }, [currentNode, path]);

  const totalSpecies = useMemo(
    () => treemapData.reduce((s, c) => s + (c.realValue ?? c.value), 0),
    [treemapData]
  );

  const handleDrillDown = useCallback(
    (name: string) => {
      const child = currentNode.children?.find((c) => c.name === name);
      if (child?.children && child.children.length > 0) {
        setPath((p) => [...p, name]);
      }
    },
    [currentNode]
  );

  const handleBack = useCallback(() => {
    setPath((p) => p.slice(0, -1));
  }, []);

  const depthLabels = ["Regnes", "Embranchements", "Classes"];
  const currentLabel = depthLabels[path.length] || "Groupes";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {path.length > 0 && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
            >
              <ChevronLeft className="w-4 h-4" />
              Retour
            </button>
          )}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <button
              onClick={() => setPath([])}
              className="hover:text-foreground transition-colors"
            >
              Vivant
            </button>
            {path.map((segment, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="text-border">›</span>
                <button
                  onClick={() => setPath(path.slice(0, i + 1))}
                  className="hover:text-foreground transition-colors"
                >
                  {segment}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{totalSpecies.toLocaleString("fr-FR")}</span>{" "}
          especes · {treemapData.length} {currentLabel.toLowerCase()}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden border border-border bg-card">
        <ResponsiveContainer width="100%" height={420}>
          <Treemap
            data={treemapData}
            dataKey="value"
            stroke="white"
            animationDuration={300}
            content={<CustomContent onDrillDown={handleDrillDown} parentName={path.length > 0 ? path[path.length - 1] : undefined} />}
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {path.length === 0 && (
        <p className="text-center text-xs text-muted-foreground mt-3">
          Cliquez sur un groupe pour explorer ses sous-groupes
        </p>
      )}
    </div>
  );
}
