import { useState, useMemo, useCallback, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import animaliaImg from "@/assets/images/animalia.png";
import plantaeImg from "@/assets/images/plantae.png";
import fungiImg from "@/assets/images/fungi.png";

interface TreeNode {
  name: string;
  value?: number;
  children?: TreeNode[];
}

const KINGDOM_COLORS: Record<string, string> = {
  Animalia: "#2a5a3a",
  Plantae: "#3d6b3d",
  Fungi: "#8b6b3e",
  Chromista: "#2e5a5a",
  Bacteria: "#9b4a2a",
  Protozoa: "#5a3a6a",
  Archaea: "#b07a28",
  Orthornavirae: "#7a2e2e",
};

function adjustColor(hex: string, lightenAmount: number, saturationShift: number = 0): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.min(255, Math.round(r + (255 - r) * lightenAmount));
  const ng = Math.min(255, Math.round(g + (255 - g) * lightenAmount));
  const nb = Math.min(255, Math.round(b + (255 - b) * lightenAmount));
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
    const variation = (Math.abs(hash) % 25) / 100;
    return adjustColor(base, 0.08 + variation);
  }
  return "#3a3a2e";
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DataItem {
  name: string;
  value: number;
  realValue: number;
  parentName: string;
  hasChildren: boolean;
}

interface LayoutItem extends DataItem {
  rect: Rect;
}

function worstAspectRatio(areas: number[], side: number): number {
  const rowArea = areas.reduce((s, a) => s + a, 0);
  if (rowArea <= 0 || side <= 0) return Infinity;
  const rowWidth = rowArea / side;
  let worst = 0;
  for (const area of areas) {
    const h = area / rowWidth;
    const ratio = Math.max(rowWidth / h, h / rowWidth);
    if (ratio > worst) worst = ratio;
  }
  return worst;
}

function squarify(items: DataItem[], bounds: Rect): LayoutItem[] {
  if (items.length === 0) return [];

  const totalValue = items.reduce((s, it) => s + it.value, 0);
  if (totalValue <= 0) return [];

  const boundsArea = bounds.w * bounds.h;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const areas = sorted.map((it) => (it.value / totalValue) * boundsArea);

  const result: LayoutItem[] = [];
  let { x, y, w, h } = bounds;
  let idx = 0;

  while (idx < sorted.length) {
    const side = Math.min(w, h);
    if (side <= 0) break;

    const rowIndices: number[] = [idx];
    let rowAreas = [areas[idx]];
    idx++;

    while (idx < sorted.length) {
      const currentWorst = worstAspectRatio(rowAreas, side);
      const candidateAreas = [...rowAreas, areas[idx]];
      const candidateWorst = worstAspectRatio(candidateAreas, side);
      if (candidateWorst <= currentWorst) {
        rowIndices.push(idx);
        rowAreas = candidateAreas;
        idx++;
      } else {
        break;
      }
    }

    const totalRowArea = rowAreas.reduce((s, a) => s + a, 0);
    const isHorizontal = w >= h;
    const strip = totalRowArea / side;

    let offset = 0;
    for (let i = 0; i < rowIndices.length; i++) {
      const itemLen = rowAreas[i] / strip;

      let rect: Rect;
      if (isHorizontal) {
        rect = { x, y: y + offset, w: strip, h: itemLen };
      } else {
        rect = { x: x + offset, y, w: itemLen, h: strip };
      }

      result.push({ ...sorted[rowIndices[i]], rect });
      offset += itemLen;
    }

    if (isHorizontal) {
      x += strip;
      w -= strip;
    } else {
      y += strip;
      h -= strip;
    }
  }

  return result;
}

const KINGDOM_IMAGES: Record<string, string> = {
  Animalia: animaliaImg,
  Plantae: plantaeImg,
  Fungi: fungiImg,
};

const FONT_STACK = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

interface Props {
  data: TreeNode;
  onNavigateToTaxon?: (name: string, rang: string) => void;
}

export function TaxonomyTreemap({ data, onNavigateToTaxon }: Props) {
  const [path, setPath] = useState<string[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; value: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentNode = useMemo(() => {
    let node = data;
    for (const segment of path) {
      const child = node.children?.find((c) => c.name === segment);
      if (!child) break;
      node = child;
    }
    return node;
  }, [data, path]);

  const treemapItems = useMemo(() => {
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
    () => treemapItems.reduce((s, c) => s + c.realValue, 0),
    [treemapItems]
  );

  const layoutItems = useMemo(() => {
    return squarify(treemapItems, { x: 0, y: 0, w: 960, h: 420 });
  }, [treemapItems]);

  const depthToRang: Record<number, string> = { 0: "KD", 1: "PH", 2: "CL", 3: "OR", 4: "FM" };

  const handleClick = useCallback(
    (name: string) => {
      const child = currentNode.children?.find((c) => c.name === name);
      if (child?.children && child.children.length > 0) {
        setPath((p) => [...p, name]);
        setTooltip(null);
      } else {
        const rang = depthToRang[path.length + 1] || depthToRang[path.length] || "FM";
        onNavigateToTaxon?.(name, rang);
      }
    },
    [currentNode, path, onNavigateToTaxon]
  );

  const handleBack = useCallback(() => {
    setPath((p) => p.slice(0, -1));
    setTooltip(null);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent, item: LayoutItem) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    setTooltip({
      x: Math.min(rawX + 12, containerW - 170),
      y: Math.max(10, Math.min(rawY - 50, containerH - 60)),
      name: item.name,
      value: item.realValue,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const depthLabels = ["Regnes", "Embranchements", "Classes", "Ordres", "Familles"];
  const currentLabel = depthLabels[path.length] || "Groupes";

  if (treemapItems.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">Aucune donnee disponible</div>;
  }

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
          especes · {treemapItems.length} {currentLabel.toLowerCase()}
        </div>
      </div>

      <div ref={containerRef} className="relative rounded-xl overflow-hidden border border-border" style={{ backgroundColor: "#0d0f0a" }}>
        <svg
          viewBox="0 0 960 420"
          className="w-full"
          style={{ display: "block", height: "auto", aspectRatio: "960/420" }}
        >
          <defs>
            {path.length === 0 && layoutItems.map((item) => {
              const img = KINGDOM_IMAGES[item.name];
              if (!img) return null;
              const { rect } = item;
              const rw = Math.max(0, rect.w - 2);
              const rh = Math.max(0, rect.h - 2);
              if (rw <= 0 || rh <= 0) return null;
              const imgSize = Math.max(rw, rh);
              return (
                <pattern
                  key={`pat-${item.name}`}
                  id={`img-${item.name}`}
                  patternUnits="userSpaceOnUse"
                  x={rect.x + 1}
                  y={rect.y + 1}
                  width={rw}
                  height={rh}
                >
                  <image
                    href={img}
                    x={(rw - imgSize) / 2}
                    y={(rh - imgSize) / 2}
                    width={imgSize}
                    height={imgSize}
                    preserveAspectRatio="xMidYMid slice"
                  />
                </pattern>
              );
            })}
          </defs>
          {layoutItems.map((item) => {
            const { rect } = item;
            const color = getColorForItem(item.name, item.parentName);
            const showLabel = rect.w > 40 && rect.h > 24;
            const showValue = rect.w > 60 && rect.h > 44;
            const fontSize = Math.min(22, Math.max(10, Math.min(rect.w / 6, rect.h / 4)));
            const valueFontSize = Math.max(10, fontSize * 0.7);
            const gap = fontSize * 0.9;
            const isLeaf = !item.hasChildren;
            const hasImage = path.length === 0 && !!KINGDOM_IMAGES[item.name];

            return (
              <g
                key={item.name}
                className="cursor-pointer"
                onClick={() => handleClick(item.name)}
                onMouseMove={(e) => handleMouseMove(e, item)}
                onMouseLeave={handleMouseLeave}
              >
                {hasImage ? (
                  <>
                    <rect
                      x={rect.x + 1.5}
                      y={rect.y + 1.5}
                      width={Math.max(0, rect.w - 3)}
                      height={Math.max(0, rect.h - 3)}
                      fill={`url(#img-${item.name})`}
                      rx={3}
                    />
                    <rect
                      x={rect.x + 1.5}
                      y={rect.y + 1.5}
                      width={Math.max(0, rect.w - 3)}
                      height={Math.max(0, rect.h - 3)}
                      fill={color}
                      opacity={0.55}
                      rx={3}
                      className="transition-opacity hover:opacity-40"
                    />
                  </>
                ) : (
                  <rect
                    x={rect.x + 1.5}
                    y={rect.y + 1.5}
                    width={Math.max(0, rect.w - 3)}
                    height={Math.max(0, rect.h - 3)}
                    fill={color}
                    rx={3}
                    className="transition-opacity hover:opacity-80"
                  />
                )}
                {showLabel && (
                  <text
                    x={rect.x + rect.w / 2}
                    y={rect.y + rect.h / 2 - (showValue ? gap / 2 : 0)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#f0e8d0"
                    fontWeight="400"
                    fontSize={fontSize}
                    fontFamily={FONT_STACK}
                    letterSpacing="0.03em"
                    className="pointer-events-none select-none"
                  >
                    {item.name.length > Math.floor(rect.w / (fontSize * 0.55))
                      ? item.name.slice(0, Math.floor(rect.w / (fontSize * 0.55)) - 1) + "…"
                      : item.name}
                  </text>
                )}
                {showValue && (
                  <text
                    x={rect.x + rect.w / 2}
                    y={rect.y + rect.h / 2 + gap / 2 + 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="rgba(240,232,208,0.65)"
                    fontSize={valueFontSize}
                    fontFamily={FONT_STACK}
                    fontWeight="400"
                    className="pointer-events-none select-none"
                  >
                    {item.realValue.toLocaleString("fr-FR")}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {tooltip && (
          <div
            className="absolute rounded-lg shadow-lg px-3 py-2 text-sm pointer-events-none z-10"
            style={{ left: tooltip.x, top: tooltip.y, backgroundColor: "rgba(13,15,10,0.92)", border: "1px solid rgba(240,232,208,0.2)" }}
          >
            <div className="font-semibold" style={{ color: "#f0e8d0" }}>{tooltip.name}</div>
            <div className="text-xs" style={{ color: "rgba(240,232,208,0.6)" }}>
              {tooltip.value.toLocaleString("fr-FR")} especes
            </div>
          </div>
        )}
      </div>

      {path.length === 0 && (
        <p className="text-center text-xs text-muted-foreground mt-3">
          Cliquez sur un groupe pour explorer ses sous-groupes
        </p>
      )}
    </div>
  );
}
