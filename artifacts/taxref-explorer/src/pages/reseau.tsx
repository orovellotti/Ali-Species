import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  Search,
  X,
  Crosshair,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import ForceGraph3D from "react-force-graph-3d";
import SpriteText from "three-spritetext";
import {
  useSearchTaxons,
  getSearchTaxonsQueryKey,
  getSpeciesGraph,
} from "@workspace/api-client-react";
import type {
  GraphNode as ApiGraphNode,
  GraphLink as ApiGraphLink,
} from "@workspace/api-client-react";
import { taxonUrl } from "@/lib/constants";
import { GraphErrorBoundary } from "@/components/GraphErrorBoundary";

type NodeType = ApiGraphNode["type"];
type Category =
  | "taxonomie"
  | "ecologie"
  | "conservation"
  | "traits"
  | "distribution"
  | "interactions"
  | "sources"
  | "ia";

interface GNode extends ApiGraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

interface GLink {
  source: string | GNode;
  target: string | GNode;
  label: string | null;
  kind: ApiGraphLink["kind"];
}

// Minimal handle on the 3D graph methods we actually call.
interface Graph3DMethods {
  zoomToFit: (ms?: number, px?: number) => void;
}

// Real data layers, in display order, plus the "ia" placeholder (disabled).
const LAYER_ORDER: Category[] = [
  "taxonomie",
  "ecologie",
  "conservation",
  "traits",
  "distribution",
  "interactions",
  "sources",
  "ia",
];
const REAL_CATEGORIES: Category[] = LAYER_ORDER.filter((c) => c !== "ia");

// Layer groups: species-own attributes vs interspecific relations vs meta.
const LAYER_GROUPS: { key: "attributs" | "relations" | "meta"; layers: Category[] }[] = [
  {
    key: "attributs",
    layers: ["taxonomie", "ecologie", "conservation", "traits", "distribution"],
  },
  { key: "relations", layers: ["interactions"] },
  { key: "meta", layers: ["sources", "ia"] },
];

const CATEGORY_COLORS: Record<Category, string> = {
  taxonomie: "#a78bfa",
  ecologie: "#34d399",
  conservation: "#fb7185",
  traits: "#fbbf24",
  distribution: "#38bdf8",
  interactions: "#f472b6",
  sources: "#f97316",
  ia: "#64748b",
};

function nodeColor(n: GNode, centerId: string | null): string {
  if (n.id === centerId) return "#ffffff";
  const cat = n.category as Category;
  return CATEGORY_COLORS[cat] ?? "#94a3b8";
}

function idOf(e: string | GNode): string {
  return typeof e === "object" ? e.id : e;
}

const SUGGESTIONS: { cdNom: number; label: string }[] = [
  { cdNom: 60585, label: "Renard roux" },
  { cdNom: 60577, label: "Loup gris" },
  { cdNom: 60826, label: "Ours brun" },
  { cdNom: 3493, label: "Grand-duc d'Europe" },
  { cdNom: 78130, label: "Vipère aspic" },
  { cdNom: 239523, label: "Abeille domestique" },
  { cdNom: 116759, label: "Chêne pédonculé" },
];

const DEFAULT_CD_NOM = 60585;

function linkId(l: ApiGraphLink): string {
  return `${l.source}->${l.target}:${l.kind}`;
}

export default function Reseau() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const graph3dRef = useRef<Graph3DMethods | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [size, setSize] = useState({ width: 0, height: 0 });

  const [nodes, setNodes] = useState<GNode[]>([]);
  const [links, setLinks] = useState<GLink[]>([]);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Layer visibility. All real layers on by default.
  const [activeLayers, setActiveLayers] = useState<Set<Category>>(
    () => new Set(REAL_CATEGORIES),
  );

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const { data: searchResults } = useSearchTaxons(
    { q: debouncedQuery, limit: 8 },
    {
      query: {
        enabled: debouncedQuery.trim().length >= 2,
        queryKey: getSearchTaxonsQueryKey({ q: debouncedQuery, limit: 8 }),
      },
    },
  );

  // Track ids present so we can merge neighbourhoods without duplicates.
  const nodeIds = useRef<Set<string>>(new Set());
  const linkIds = useRef<Set<string>>(new Set());
  // Live handle on the current nodes for the engine-tick anchor enforcement
  // (react-force-graph binds onEngineTick once, so a captured array goes stale).
  const nodesRef = useRef<GNode[]>([]);
  nodesRef.current = nodes;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadGraph = useCallback(
    async (cdNom: number, mode: "replace" | "merge") => {
      setLoading(true);
      try {
        const data = await getSpeciesGraph(
          cdNom,
          import.meta.env.DEV ? { cache: "no-store" } : undefined,
        );
        if (mode === "replace") {
          nodeIds.current = new Set();
          linkIds.current = new Set();
          const freshNodes: GNode[] = [];
          for (const n of data.nodes) {
            if (!nodeIds.current.has(n.id)) {
              nodeIds.current.add(n.id);
              freshNodes.push({ ...n });
            }
          }
          const freshLinks: GLink[] = [];
          for (const l of data.links) {
            const id = linkId(l);
            if (!linkIds.current.has(id)) {
              linkIds.current.add(id);
              freshLinks.push({ ...l });
            }
          }
          setNodes(freshNodes);
          setLinks(freshLinks);
          setSelectedId(null);
        } else {
          setNodes((prev) => {
            const byId = new Map(prev.map((n) => [n.id, n]));
            for (const n of data.nodes) {
              const existing = byId.get(n.id);
              if (existing) {
                // Upsert payload fields but keep live simulation coords so
                // an expanded partner correctly upgrades to species/center.
                existing.type = n.type;
                existing.category = n.category;
                existing.label = n.label;
                existing.sub = n.sub;
                existing.cdNom = n.cdNom;
                existing.rang = n.rang;
                existing.group = n.group;
                existing.source = n.source;
                existing.description = n.description;
                existing.confidence = n.confidence;
                existing.url = n.url;
              } else {
                nodeIds.current.add(n.id);
                const created = { ...n };
                byId.set(n.id, created);
              }
            }
            return Array.from(byId.values());
          });
          setLinks((prev) => {
            const next = [...prev];
            for (const l of data.links) {
              const id = linkId(l);
              if (!linkIds.current.has(id)) {
                linkIds.current.add(id);
                next.push({ ...l });
              }
            }
            return next;
          });
        }
        setCenterId(data.center);
      } catch {
        // Endpoint degrades gracefully; nothing to merge on failure.
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadGraph(DEFAULT_CD_NOM, "replace");
  }, [loadGraph]);

  // Lay the graph out as themed sectors. Rather than fight react-force-graph's
  // force resets, we pin the centre and each thematic hub to a fixed angle
  // around it; leaves then settle naturally into a tight cluster around their
  // own pinned hub, so each theme reads as its own region.
  useEffect(() => {
    if (!centerId || nodes.length === 0) return;
    // In 3D we let the simulation settle naturally in space (no plane pinning),
    // which reads as depth across the multi-level hierarchy.
    if (viewMode === "3d") {
      for (const n of nodes) {
        n.fx = undefined;
        n.fy = undefined;
      }
      return;
    }
    // Spread the seven hubs evenly (~51° apart) around the centre so each theme
    // owns a distinct sector and their leaf clusters never overlap. Lineage
    // sits on the left, where its chain trails off.
    const DEG = Math.PI / 180;
    const HUB_ANGLE: Record<string, number> = {
      ancestor: 180 * DEG,
      statut: 231 * DEG,
      habitat: 283 * DEG,
      distribution: 334 * DEG,
      trait: 26 * DEG,
      partner: 77 * DEG,
      sources: 129 * DEG,
    };
    const R = 240;
    // Hubs are namespaced per centre (`hub:<cdNom>:<theme>`), so only pin the
    // ones belonging to the active centre.
    const hubPrefix = `hub:${centerId.replace(/^taxon:/, "")}:`;
    for (const n of nodes) {
      // Clear any anchor left over from a previous centre before re-pinning,
      // otherwise merged-in old centres/hubs stay frozen via onEngineTick.
      n.fx = undefined;
      n.fy = undefined;
      if (n.id === centerId) {
        n.fx = 0;
        n.fy = 0;
      } else if (
        n.id.startsWith(hubPrefix) &&
        n.group &&
        n.group in HUB_ANGLE
      ) {
        const a = HUB_ANGLE[n.group];
        n.fx = Math.cos(a) * R;
        n.fy = Math.sin(a) * R;
      }
    }
    const fg = graphRef.current;
    if (!fg) return;
    const raf = requestAnimationFrame(() => {
      const g = graphRef.current;
      if (!g) return;
      const charge = g.d3Force("charge") as unknown as
        | { strength: (fn: (n: GNode) => number) => void }
        | undefined;
      // Light repulsion keeps leaves from overlapping without blowing clusters
      // apart; the pinned hubs already guarantee separation.
      charge?.strength((n) => (n.id.startsWith("hub:") ? -60 : -22));
      const link = g.d3Force("link") as unknown as
        | { distance: (fn: (l: GLink) => number) => void }
        | undefined;
      if (link && typeof link.distance === "function") {
        link.distance((l) =>
          idOf(l.source).startsWith("hub:") || idOf(l.target).startsWith("hub:")
            ? l.kind === "ancestor"
              ? 30
              : 18
            : 18,
        );
      }
      g.d3ReheatSimulation();
    });
    return () => cancelAnimationFrame(raf);
  }, [size.width, nodes.length, centerId, viewMode]);

  // --- Layer filtering -------------------------------------------------------
  const visibleNodes = useMemo(
    () =>
      nodes.filter(
        (n) => n.id === centerId || activeLayers.has(n.category as Category),
      ),
    [nodes, centerId, activeLayers],
  );
  const visibleIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  );
  const visibleLinks = useMemo(
    () =>
      links.filter(
        (l) => visibleIds.has(idOf(l.source)) && visibleIds.has(idOf(l.target)),
      ),
    [links, visibleIds],
  );
  const graphData = useMemo(
    () => ({ nodes: visibleNodes, links: visibleLinks }),
    [visibleNodes, visibleLinks],
  );

  // Neighbours of the hovered node, for subtle highlight.
  const neighbours = useMemo(() => {
    if (!hoverId) return null;
    const ids = new Set<string>([hoverId]);
    const linkSet = new Set<GLink>();
    for (const l of visibleLinks) {
      const s = idOf(l.source);
      const tg = idOf(l.target);
      if (s === hoverId || tg === hoverId) {
        ids.add(s);
        ids.add(tg);
        linkSet.add(l);
      }
    }
    return { ids, linkSet };
  }, [hoverId, visibleLinks]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const expandNode = useCallback(
    (node: GNode) => {
      if (node.cdNom) {
        void loadGraph(node.cdNom, "merge");
        if (viewMode === "2d") {
          graphRef.current?.centerAt(node.x, node.y, 600);
          graphRef.current?.zoom(2, 600);
        } else {
          graph3dRef.current?.zoomToFit(600, 80);
        }
      }
    },
    [loadGraph, viewMode],
  );

  const handleNodeClick = useCallback((node: GNode) => {
    setSelectedId(node.id);
  }, []);

  // Right-click stays a power-user shortcut to expand a taxon in place.
  const handleNodeRightClick = useCallback(
    (node: GNode) => {
      if (node.type === "hub") return;
      expandNode(node);
    },
    [expandNode],
  );

  const pickTaxon = useCallback(
    (cdNom: number) => {
      setSearchOpen(false);
      setQuery("");
      void loadGraph(cdNom, "replace");
      if (viewMode === "2d") graphRef.current?.zoomToFit(600, 60);
      else graph3dRef.current?.zoomToFit(600, 80);
    },
    [loadGraph, viewMode],
  );

  // Single click on a layer button toggles it; double click focuses on it
  // (hides every other layer). We debounce the single click to tell them apart.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleLayer = useCallback((c: Category) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }, []);
  const focusLayer = useCallback((c: Category) => {
    setActiveLayers(new Set([c]));
  }, []);
  const onLayerButton = useCallback(
    (c: Category) => {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
        focusLayer(c);
        return;
      }
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        toggleLayer(c);
      }, 220);
    },
    [focusLayer, toggleLayer],
  );

  const showAll = useCallback(
    () => setActiveLayers(new Set(REAL_CATEGORIES)),
    [],
  );
  const hideAll = useCallback(() => setActiveLayers(new Set()), []);

  return (
    <Layout>
      <Helmet>
        <title>{t("reseau.title")}</title>
        <meta name="description" content={t("reseau.metaDescription")} />
      </Helmet>

      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: "calc(100dvh - 4rem)", background: "#05070d" }}
        data-testid="graph-container"
      >
        {/* Radial glow backdrop */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 45%, rgba(56,189,248,0.10), transparent 60%)",
          }}
        />

        {size.width > 0 && viewMode === "3d" && (
          <GraphErrorBoundary
            onError={() => setViewMode("2d")}
            fallback={
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-400">
                {t("reseau.controls.no3d")}
              </div>
            }
          >
          <ForceGraph3D
            ref={graph3dRef as never}
            graphData={graphData}
            width={size.width}
            height={size.height}
            backgroundColor="#05070d"
            nodeId="id"
            showNavInfo={false}
            nodeColor={(n) => nodeColor(n as GNode, centerId)}
            nodeVal={(n) => {
              const g = n as GNode;
              if (g.id === centerId) return 14;
              if (g.type === "species") return 8;
              if (g.type === "hub") return 6;
              if (g.type === "ancestor" || g.type === "partner") return 4;
              return 2.5;
            }}
            nodeOpacity={0.95}
            nodeResolution={14}
            nodeLabel={(n) => {
              const g = n as GNode;
              const label = g.type === "hub" ? t(`reseau.hub.${g.group}`) : g.label;
              return `<div style="padding:2px 6px;border-radius:6px;background:rgba(5,7,13,0.85);color:#e2e8f0;font:12px Inter,system-ui,sans-serif">${label}</div>`;
            }}
            nodeThreeObjectExtend
            nodeThreeObject={(n) => {
              const g = n as GNode;
              const raw =
                g.type === "hub" ? t(`reseau.hub.${g.group}`) : g.label;
              const label = raw.length > 28 ? `${raw.slice(0, 27)}…` : raw;
              const sprite = new SpriteText(label);
              sprite.color =
                g.id === centerId ? "#ffffff" : "rgba(226,232,240,0.9)";
              sprite.textHeight =
                g.id === centerId ? 5 : g.type === "hub" ? 4 : 3;
              sprite.fontFace = "Inter, system-ui, sans-serif";
              sprite.fontWeight = g.type === "hub" || g.id === centerId ? "600" : "400";
              const nodeVal =
                g.id === centerId
                  ? 14
                  : g.type === "species"
                    ? 8
                    : g.type === "hub"
                      ? 6
                      : g.type === "ancestor" || g.type === "partner"
                        ? 4
                        : 2.5;
              // Lift the label just above the sphere (radius ~ cbrt(val)*4).
              sprite.position.set(0, Math.cbrt(nodeVal) * 4 + 2.5, 0);
              return sprite;
            }}
            linkColor={() => "rgba(148,163,184,0.28)"}
            linkOpacity={0.28}
            linkWidth={0.4}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={1.4}
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalParticleColor={(l) => {
              const s = idOf((l as GLink).source);
              const tg = idOf((l as GLink).target);
              const hub = s.startsWith("hub:")
                ? s
                : tg.startsWith("hub:")
                  ? tg
                  : null;
              const cat = hub
                ? (nodes.find((n) => n.id === hub)?.category as Category)
                : undefined;
              return (cat && CATEGORY_COLORS[cat]) || "#94a3b8";
            }}
            onNodeHover={(n) => setHoverId(n ? (n as GNode).id : null)}
            onNodeClick={(n) => handleNodeClick(n as GNode)}
            onNodeRightClick={(n) => handleNodeRightClick(n as GNode)}
            onBackgroundClick={() => {
              setHoverId(null);
              setSelectedId(null);
            }}
            onEngineStop={() => graph3dRef.current?.zoomToFit(600, 80)}
          />
          </GraphErrorBoundary>
        )}

        {size.width > 0 && viewMode === "2d" && (
          <ForceGraph2D
            ref={graphRef as never}
            graphData={graphData}
            width={size.width}
            height={size.height}
            backgroundColor="#05070d"
            nodeId="id"
            cooldownTicks={120}
            onEngineTick={() => {
              // react-force-graph ignores fx/fy set after graphData ingest, so
              // we hard-enforce the centre and hub anchor points every tick.
              for (const n of nodesRef.current) {
                if (n.fx === undefined || n.fy === undefined) continue;
                n.x = n.fx;
                n.y = n.fy;
                n.vx = 0;
                n.vy = 0;
              }
            }}
            onEngineStop={() => graphRef.current?.zoomToFit(400, 60)}
            linkColor={(l) => {
              const link = l as GLink;
              const active = !neighbours || neighbours.linkSet.has(link);
              return active
                ? "rgba(148,163,184,0.35)"
                : "rgba(148,163,184,0.06)";
            }}
            linkWidth={(l) =>
              neighbours && neighbours.linkSet.has(l as GLink) ? 1.6 : 0.6
            }
            onNodeHover={(n) => setHoverId(n ? (n as GNode).id : null)}
            onNodeClick={(n) => handleNodeClick(n as GNode)}
            onNodeRightClick={(n) => handleNodeRightClick(n as GNode)}
            onBackgroundClick={() => {
              setHoverId(null);
              setSelectedId(null);
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as GNode;
              const isCenter = n.id === centerId;
              const isHub = n.type === "hub";
              const isSelected = n.id === selectedId;
              const dimmed = neighbours && !neighbours.ids.has(n.id);
              const color = nodeColor(n, centerId);
              const base =
                n.type === "species"
                  ? 7
                  : isHub
                    ? 6
                    : n.type === "ancestor" || n.type === "partner"
                      ? 5
                      : 4;
              const r = isCenter ? 9 : base;

              // Glow
              ctx.save();
              ctx.globalAlpha = dimmed ? 0.25 : 1;
              ctx.shadowColor = color;
              ctx.shadowBlur = isCenter ? 24 : 12;
              ctx.beginPath();
              ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
              if (isCenter || isSelected) {
                ctx.lineWidth = (isSelected ? 2.5 : 2) / globalScale;
                ctx.strokeStyle = "#ffffff";
                ctx.stroke();
              }
              ctx.restore();

              // Label — center always; others on zoom-in or when hovering
              // their neighbourhood, to keep dense clusters legible.
              const showLabel =
                isCenter ||
                isHub ||
                isSelected ||
                globalScale > 2.2 ||
                (!!neighbours && neighbours.ids.has(n.id));
              if (showLabel && !dimmed) {
                const fontSize = Math.max(3, 11 / globalScale);
                ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillStyle = "rgba(226,232,240,0.9)";
                const raw = isHub ? t(`reseau.hub.${n.group}`) : n.label;
                const label = raw.length > 28 ? `${raw.slice(0, 27)}…` : raw;
                if (isHub) {
                  ctx.fillStyle = "rgba(226,232,240,0.75)";
                  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
                }
                ctx.fillText(label, n.x!, n.y! + r + 1.5);
              }
            }}
          />
        )}

        {/* Top-center: layer filter bar */}
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-2 rounded-2xl border border-white/10 bg-black/60 px-2 py-2 backdrop-blur-md shadow-xl">
            {LAYER_GROUPS.map((group, gi) => (
              <div key={group.key} className="flex items-center gap-1.5">
                {gi > 0 && (
                  <span className="mx-0.5 hidden h-6 w-px bg-white/15 sm:block" />
                )}
                {group.key !== "meta" && (
                  <span className="mr-0.5 hidden text-[10px] font-semibold uppercase tracking-wide text-slate-500 lg:block">
                    {t(`reseau.groups.${group.key}`)}
                  </span>
                )}
                {group.layers.map((c) => {
                  const disabled = c === "ia";
                  const active = !disabled && activeLayers.has(c);
                  const color = CATEGORY_COLORS[c];
                  return (
                    <button
                      key={c}
                      disabled={disabled}
                      onClick={() => !disabled && onLayerButton(c)}
                      title={
                        disabled
                          ? t("reseau.soon")
                          : t("reseau.controls.focusHint")
                      }
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        disabled
                          ? "cursor-not-allowed border-white/5 bg-white/5 text-slate-500"
                          : active
                            ? "border-transparent text-slate-900"
                            : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                      }`}
                      style={
                        active && !disabled
                          ? { background: color, boxShadow: `0 0 10px ${color}66` }
                          : undefined
                      }
                      data-testid={`layer-${c}`}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{
                          background: active && !disabled ? "#0f172a" : color,
                        }}
                      />
                      {t(`reseau.layers.${c}`)}
                      {disabled && (
                        <span className="ml-1 rounded bg-white/10 px-1 text-[9px] uppercase tracking-wide text-slate-400">
                          {t("reseau.soon")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

          </div>
        </div>

        {/* Bottom-right: show/hide + recenter */}
        <div className="absolute right-4 bottom-16 z-10 flex items-center gap-1.5">
          <div className="mr-1 flex overflow-hidden rounded-full border border-white/10 bg-black/60 backdrop-blur-md">
            {(["2d", "3d"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                title={t(`reseau.controls.view${m === "2d" ? "2D" : "3D"}`)}
                aria-label={t(`reseau.controls.view${m === "2d" ? "2D" : "3D"}`)}
                aria-pressed={viewMode === m}
                className={`px-3 py-2 text-xs font-semibold uppercase transition ${
                  viewMode === m
                    ? "bg-sky-500 text-white"
                    : "text-slate-300 hover:bg-white/10"
                }`}
                data-testid={`button-view-${m}`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={showAll}
            title={t("reseau.controls.showAll")}
            aria-label={t("reseau.controls.showAll")}
            className="flex items-center justify-center rounded-full border border-white/10 bg-black/60 p-2 text-slate-200 backdrop-blur-md hover:bg-black/80"
            data-testid="button-show-all"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={hideAll}
            title={t("reseau.controls.hideAll")}
            aria-label={t("reseau.controls.hideAll")}
            className="flex items-center justify-center rounded-full border border-white/10 bg-black/60 p-2 text-slate-200 backdrop-blur-md hover:bg-black/80"
            data-testid="button-hide-all"
          >
            <EyeOff className="h-4 w-4" />
          </button>
          <button
            onClick={() =>
              viewMode === "2d"
                ? graphRef.current?.zoomToFit(500, 60)
                : graph3dRef.current?.zoomToFit(500, 80)
            }
            title={t("reseau.reset")}
            aria-label={t("reseau.reset")}
            className="flex items-center justify-center rounded-full border border-white/10 bg-black/60 p-2 text-slate-200 backdrop-blur-md hover:bg-black/80"
            data-testid="button-recenter"
          >
            <Crosshair className="h-4 w-4" />
          </button>
        </div>

        {/* Right: detail panel */}
        {selectedNode && (
          <aside
            className="absolute right-4 top-28 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-black/80 p-4 backdrop-blur-md shadow-2xl"
            data-testid="node-panel"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{
                    background: nodeColor(selectedNode, centerId),
                    boxShadow: `0 0 8px ${nodeColor(selectedNode, centerId)}`,
                  }}
                />
                <h2 className="text-sm font-semibold text-slate-100">
                  {selectedNode.label}
                </h2>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="text-slate-400 hover:text-slate-200"
                aria-label={t("reseau.panel.close")}
                data-testid="button-close-panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                {t(`reseau.nodeType.${selectedNode.type}`)}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-900"
                style={{
                  background:
                    CATEGORY_COLORS[selectedNode.category as Category] ??
                    "#94a3b8",
                }}
              >
                {t(`reseau.layers.${selectedNode.category}`)}
              </span>
            </div>

            <dl className="mt-3 space-y-2 text-xs">
              {selectedNode.description && (
                <div>
                  <dt className="text-slate-500">
                    {t("reseau.panel.descriptionLabel")}
                  </dt>
                  <dd className="text-slate-200">{selectedNode.description}</dd>
                </div>
              )}
              {selectedNode.source && (
                <div>
                  <dt className="text-slate-500">
                    {t("reseau.panel.sourceLabel")}
                  </dt>
                  <dd className="text-slate-200">{selectedNode.source}</dd>
                </div>
              )}
              {selectedNode.confidence && (
                <div>
                  <dt className="text-slate-500">
                    {t("reseau.panel.confidenceLabel")}
                  </dt>
                  <dd className="text-slate-200">{selectedNode.confidence}</dd>
                </div>
              )}
            </dl>

            <div className="mt-4 flex flex-col gap-2">
              {selectedNode.cdNom && selectedNode.type !== "hub" && (
                <>
                  <button
                    onClick={() => expandNode(selectedNode)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-sky-500/90 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
                    data-testid="button-explore-node"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    {t("reseau.panel.explore")}
                  </button>
                  <button
                    onClick={() =>
                      navigate(
                        taxonUrl(selectedNode.cdNom!, selectedNode.label),
                      )
                    }
                    className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"
                    data-testid="button-open-sheet"
                  >
                    {t("reseau.panel.openSheet")}
                  </button>
                </>
              )}
              {selectedNode.url && (
                <a
                  href={selectedNode.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"
                  data-testid="link-source"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("reseau.panel.sourceLink")}
                </a>
              )}
            </div>
          </aside>
        )}

        {/* Top-left: search */}
        <div className="absolute left-4 top-28 z-10 flex flex-col gap-2">
          {searchOpen ? (
            <div className="w-72 rounded-xl border border-white/10 bg-black/60 backdrop-blur-md shadow-2xl">
              <div className="flex items-center gap-2 px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("reseau.searchPlaceholder")}
                  className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                  data-testid="input-graph-search"
                />
                <button
                  onClick={() => {
                    setSearchOpen(false);
                    setQuery("");
                  }}
                  className="text-slate-400 hover:text-slate-200"
                  aria-label="close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {searchResults && searchResults.length > 0 && (
                <ul className="max-h-72 overflow-y-auto border-t border-white/10 py-1">
                  {searchResults.map((r) => (
                    <li key={r.cdNom}>
                      <button
                        onClick={() => pickTaxon(r.cdNom)}
                        className="w-full px-3 py-2 text-left hover:bg-white/5"
                        data-testid={`option-taxon-${r.cdNom}`}
                      >
                        <span className="block text-sm text-slate-100">
                          {r.nomVern || r.lbNom}
                        </span>
                        <span className="block text-xs italic text-slate-400">
                          {r.lbNom}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-sm text-slate-200 backdrop-blur-md shadow-lg hover:bg-black/80"
              data-testid="button-open-graph-search"
            >
              <Search className="h-4 w-4" />
              {t("reseau.searchPlaceholder")}
            </button>
          )}

          {/* Suggestions */}
          {!searchOpen && (
            <div className="flex max-w-md flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.cdNom}
                  onClick={() => pickTaxon(s.cdNom)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10"
                  data-testid={`chip-suggestion-${s.cdNom}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom-left: legend */}
        <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-black/50 px-4 py-2 backdrop-blur-md">
          <span className="flex items-center gap-1.5 text-xs text-slate-300">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: "#ffffff", boxShadow: "0 0 6px #ffffff" }}
            />
            {t("reseau.legend.species")}
          </span>
          {REAL_CATEGORIES.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1.5 text-xs text-slate-300"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  background: CATEGORY_COLORS[c],
                  boxShadow: `0 0 6px ${CATEGORY_COLORS[c]}`,
                  opacity: activeLayers.has(c) ? 1 : 0.3,
                }}
              />
              {t(`reseau.layers.${c}`)}
            </span>
          ))}
        </div>

        {/* Bottom-right: hint */}
        <p className="absolute bottom-4 right-4 z-10 flex max-w-xs items-center gap-1.5 text-right text-xs text-slate-500">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          {t("reseau.hintLine")}
        </p>

        {/* Loading overlay */}
        {loading && nodes.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex items-center gap-3 text-slate-300">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("reseau.loading")}
            </div>
          </div>
        )}
        {loading && nodes.length > 0 && (
          <div className="absolute left-1/2 top-20 z-10 -translate-x-1/2">
            <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
          </div>
        )}
      </div>
    </Layout>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
