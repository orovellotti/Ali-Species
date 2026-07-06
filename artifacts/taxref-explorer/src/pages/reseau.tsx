import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Search, X, Crosshair, Loader2 } from "lucide-react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
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

type NodeType = ApiGraphNode["type"];

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

const TYPE_COLORS: Record<NodeType, string> = {
  species: "#38bdf8",
  hub: "#94a3b8",
  ancestor: "#a78bfa",
  statut: "#fb7185",
  habitat: "#34d399",
  trait: "#fbbf24",
  partner: "#f472b6",
};

function nodeColor(n: GNode): string {
  if (n.type === "hub" && n.group && n.group in TYPE_COLORS) {
    return TYPE_COLORS[n.group as NodeType];
  }
  return TYPE_COLORS[n.type];
}

const TYPE_ORDER: NodeType[] = [
  "species",
  "ancestor",
  "statut",
  "habitat",
  "trait",
  "partner",
];

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
  const [size, setSize] = useState({ width: 0, height: 0 });

  const [nodes, setNodes] = useState<GNode[]>([]);
  const [links, setLinks] = useState<GLink[]>([]);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

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
        } else {
          setNodes((prev) => {
            const byId = new Map(prev.map((n) => [n.id, n]));
            for (const n of data.nodes) {
              const existing = byId.get(n.id);
              if (existing) {
                // Upsert payload fields but keep live simulation coords so
                // an expanded partner correctly upgrades to species/center.
                existing.type = n.type;
                existing.label = n.label;
                existing.sub = n.sub;
                existing.cdNom = n.cdNom;
                existing.rang = n.rang;
                existing.group = n.group;
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
    // Spread the five hubs evenly (72° apart) around the centre so each theme
    // owns a distinct sector and their leaf clusters never overlap. Lineage
    // sits on the left, where its chain trails off.
    const DEG = Math.PI / 180;
    const HUB_ANGLE: Record<string, number> = {
      ancestor: 180 * DEG,
      statut: 252 * DEG,
      habitat: 324 * DEG,
      trait: 36 * DEG,
      partner: 108 * DEG,
    };
    const R = 230;
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
    const idOf = (e: string | GNode): string =>
      typeof e === "object" ? e.id : e;
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
  }, [size.width, nodes.length, centerId]);

  // Neighbours of the hovered node, for subtle highlight.
  const neighbours = useMemo(() => {
    if (!hoverId) return null;
    const ids = new Set<string>([hoverId]);
    const linkSet = new Set<GLink>();
    for (const l of links) {
      const s = typeof l.source === "string" ? l.source : l.source.id;
      const tg = typeof l.target === "string" ? l.target : l.target.id;
      if (s === hoverId || tg === hoverId) {
        ids.add(s);
        ids.add(tg);
        linkSet.add(l);
      }
    }
    return { ids, linkSet };
  }, [hoverId, links]);

  const handleNodeClick = useCallback(
    (node: GNode) => {
      if (
        (node.type === "species" ||
          node.type === "partner" ||
          node.type === "ancestor") &&
        node.cdNom
      ) {
        void loadGraph(node.cdNom, "merge");
        graphRef.current?.centerAt(node.x, node.y, 600);
        graphRef.current?.zoom(2, 600);
      }
    },
    [loadGraph],
  );

  const handleNodeDblClick = useCallback(
    (node: GNode) => {
      if (node.cdNom) {
        navigate(taxonUrl(node.cdNom, node.label));
      }
    },
    [navigate],
  );

  const pickTaxon = useCallback(
    (cdNom: number) => {
      setSearchOpen(false);
      setQuery("");
      void loadGraph(cdNom, "replace");
      graphRef.current?.zoomToFit(600, 60);
    },
    [loadGraph],
  );

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);

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

        {size.width > 0 && (
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
              const active =
                !neighbours || neighbours.linkSet.has(link);
              return active
                ? "rgba(148,163,184,0.35)"
                : "rgba(148,163,184,0.06)";
            }}
            linkWidth={(l) =>
              neighbours && neighbours.linkSet.has(l as GLink) ? 1.6 : 0.6
            }
            onNodeHover={(n) => setHoverId(n ? (n as GNode).id : null)}
            onNodeClick={(n) => handleNodeClick(n as GNode)}
            onNodeRightClick={(n) => handleNodeDblClick(n as GNode)}
            onBackgroundClick={() => setHoverId(null)}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as GNode;
              const isCenter = n.id === centerId;
              const isHub = n.type === "hub";
              const dimmed =
                neighbours && !neighbours.ids.has(n.id);
              const color = nodeColor(n);
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
              if (isCenter) {
                ctx.lineWidth = 2 / globalScale;
                ctx.strokeStyle = "#ffffff";
                ctx.stroke();
              }
              ctx.restore();

              // Label — center always; others on zoom-in or when hovering
              // their neighbourhood, to keep dense clusters legible.
              const showLabel =
                isCenter ||
                isHub ||
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

        {/* Top-left: search */}
        <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
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

        {/* Top-right: recenter */}
        <button
          onClick={() => graphRef.current?.zoomToFit(500, 60)}
          className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-2 text-xs text-slate-200 backdrop-blur-md hover:bg-black/80"
          data-testid="button-recenter"
        >
          <Crosshair className="h-4 w-4" />
          {t("reseau.reset")}
        </button>

        {/* Bottom-left: legend */}
        <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-black/50 px-4 py-2 backdrop-blur-md">
          {TYPE_ORDER.map((type) => (
            <span key={type} className="flex items-center gap-1.5 text-xs text-slate-300">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  background: TYPE_COLORS[type],
                  boxShadow: `0 0 6px ${TYPE_COLORS[type]}`,
                }}
              />
              {t(`reseau.legend.${type}`)}
            </span>
          ))}
        </div>

        {/* Bottom-right: hint */}
        <p className="absolute bottom-4 right-4 z-10 max-w-xs text-right text-xs text-slate-500">
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
          <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
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
