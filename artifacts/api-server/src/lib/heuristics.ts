const QUESTION_KEYWORDS = [
  "combien", "quel", "quels", "quelle", "quelles", "qui", "quoi", "où", "ou est", "comment", "pourquoi",
  "liste", "donne", "donnez", "montre", "montrez", "affiche", "trouve", "cherche", "cite",
  "qu'est", "c'est quoi", "explique", "raconte", "parle", "dis", "compte", "comptez",
  "ventile", "ventilation", "répartition", "repartition", "breakdown", "statut", "statuts", "par statut",
  "menacé", "menace", "menacée", "menacees", "menacés",
  "protégé", "protege", "protégée", "protegee", "protégés", "proteges",
  "rouge", "vulnérable", "vulnerable", "danger", "uicn",
  "famille de", "famille des", "espèces de", "especes de", "espèce de", "espece de",
  "réseau", "reseau", "trophique", "mange", "mangé", "consomme", "prédateur", "predateur",
  "et ", " ou ", " avec ", " dans ", " sur ", " pour ",
];

/**
 * Heuristic: returns true when a question looks like it's just a species name
 * (and therefore can be served by a fast direct DB lookup, skipping the LLM).
 * False positives fall back to the LLM path so the cost is bounded.
 */
export function looksLikeSpeciesName(q: string): boolean {
  const s = q.trim();
  if (!s || s.length > 60) return false;
  if (/[?!]/.test(s)) return false;
  const tokens = s.split(/\s+/);
  if (tokens.length === 0 || tokens.length > 5) return false;
  const low = s.toLowerCase();
  for (const w of QUESTION_KEYWORDS) {
    if (low.includes(w)) return false;
  }
  return true;
}
