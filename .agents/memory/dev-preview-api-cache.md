---
name: Dev preview serves stale cached API responses
description: Why the preview browser keeps showing old API data after a backend change
---

# Dev preview browser caches API GET responses

If a JSON API route sets `Cache-Control: public, max-age=<n>`, the preview
browser (and the screenshot tool's browser) caches the response. After you change
the route's output, the browser keeps serving the **old** body — a plain `curl`
through the proxy shows the new data while the app shows the old, which looks like
two servers disagreeing. Restarting the workflow does **not** help: the cached
entry is still within its `max-age`, so the browser never revalidates.

**Fix (two parts, both needed):**
1. Server: gate the cache header on production —
   `NODE_ENV === "production" ? "public, max-age=3600" : "no-store"`. This stops
   *future* caching but does not evict an entry already stored.
2. Client: in dev, force a bypass on the fetch — pass `{ cache: "no-store" }`
   (RequestInit) to the generated fetch call, gated on `import.meta.env.DEV`.
   This makes the browser skip the still-fresh cached entry immediately.

**Why:** symptom is "backend clearly returns X (curl proves it) but the app
renders stale Y even after restart." Suspect route-level `Cache-Control` before
suspecting the data pipeline.
