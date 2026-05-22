/**
 * URL-safe slug builder for taxon names (and any other free text).
 *
 * Lower-cases, strips diacritics via NFD decomposition, collapses every run
 * of non-`[a-z0-9]` characters into a single `-`, and trims dashes at both
 * ends. Stable and deterministic — the output is suitable for canonical URLs
 * such as `/taxon/61098-capra-ibex` and for sitemap generation.
 *
 * Mirrored client-side in `artifacts/taxref-explorer/src/lib/constants.ts`
 * (the workspaces don't share a browser-safe util package). Keep the two in
 * sync — they must produce identical output for the same input, otherwise
 * canonical URLs and sitemap URLs will drift.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
