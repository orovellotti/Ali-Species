---
name: Vite react-babel + JSX generic type args
description: Why generic type arguments on a JSX element crash the Vite react-babel parser, and the workaround.
---

Writing generic type arguments directly on a JSX element (e.g. `<ForceGraph2D<GNode, GLink> ... />`) crashes `@vitejs/plugin-react` with a Babel parse error: `Unexpected token`. The dev server returns HTTP 500 and the page shows the Babel error overlay, even though `tsc` typechecks the same syntax fine.

**Why:** the react-babel transform does not support TSX generic-call syntax on JSX opening elements; only tsc/esbuild do. Typecheck passing is not enough — the runtime bundler is a separate parser.

**How to apply:** drop the generic args from the JSX element and rely on inference or cast at usage sites instead (e.g. `<ForceGraph2D ref={ref as never} .../>` and cast callback params like `n as GNode`). Applies to any generic React component in a Vite + react-babel artifact.
