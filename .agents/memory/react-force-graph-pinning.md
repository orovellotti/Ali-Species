---
name: react-force-graph fx/fy pinning
description: How to reliably pin node positions in react-force-graph-2d (fx/fy set after ingest are ignored)
---

# Pinning nodes in react-force-graph-2d

`react-force-graph-2d` (v1.29.x) does **not** honor `fx`/`fy` that are mutated on
node objects *after* `graphData` has been ingested. Setting them in an effect,
then calling `d3ReheatSimulation()`, does not move the nodes — they stay wherever
the default layout put them.

**Reliable workaround:** use the `onEngineTick` prop to hard-set positions every
frame for the nodes you want anchored:

```
onEngineTick={() => {
  for (const n of nodesRef.current) {
    if (n.fx === undefined || n.fy === undefined) continue;
    n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0;
  }
}}
```

**Why:** the tick callback runs inside the live simulation loop, so writing
`x/y` directly (and zeroing velocity) forcibly holds the node; unpinned leaves
still settle via the link force toward their anchored parent/hub.

**How to apply:**
- `onEngineTick` binds **once** — read the current nodes through a ref
  (`nodesRef.current = nodes` each render), not a captured array, or it stays empty.
- To *unpin* a node, set `n.fx = n.fy = undefined` before the tick runs; the loop
  skips undefined anchors. Always clear stale anchors before assigning new ones
  when the anchored set changes (e.g. changing graph centre), or old anchors stay
  frozen forever.
- No JSX generics on `<ForceGraph2D>` (babel crash) — cast via `as never`/`as unknown`.
