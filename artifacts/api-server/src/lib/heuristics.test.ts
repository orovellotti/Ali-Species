import { describe, it, expect } from "vitest";
import { looksLikeSpeciesName } from "./heuristics.js";

describe("looksLikeSpeciesName", () => {
  describe("recognizes plain species names (fast-path eligible)", () => {
    it.each([
      ["Vulpes vulpes"],
      ["Renard roux"],
      ["Quercus robur"],
      ["Sciurus vulgaris"],
      ["Hippocampus"],
      ["Castor fiber"],
    ])("returns true for %s", (q) => {
      expect(looksLikeSpeciesName(q)).toBe(true);
    });
  });

  describe("rejects question-shaped queries (LLM path)", () => {
    it.each([
      ["combien d'oiseaux protégés ?"],
      ["Quels mammifères sont menacés"],
      ["Liste les amphibiens en danger"],
      ["Que mange le renard"],
      ["répartition Liste Rouge des oiseaux"],
      ["espèces de la famille des Canidae"],
      ["Donne-moi des exemples d'orchidées"],
      ["combien d'oiseaux"],
    ])("returns false for %s", (q) => {
      expect(looksLikeSpeciesName(q)).toBe(false);
    });
  });

  describe("rejects malformed or out-of-bound input", () => {
    it("returns false for empty string", () => {
      expect(looksLikeSpeciesName("")).toBe(false);
    });

    it("returns false for whitespace-only", () => {
      expect(looksLikeSpeciesName("   \n\t  ")).toBe(false);
    });

    it("returns false for too-long input (> 60 chars)", () => {
      expect(looksLikeSpeciesName("a".repeat(61))).toBe(false);
    });

    it("returns false when the string contains '?'", () => {
      expect(looksLikeSpeciesName("Vulpes ?")).toBe(false);
    });

    it("returns false when the string contains '!'", () => {
      expect(looksLikeSpeciesName("Vulpes !")).toBe(false);
    });

    it("returns false when there are more than 5 tokens", () => {
      expect(looksLikeSpeciesName("a b c d e f")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("trims input before checking length", () => {
      expect(looksLikeSpeciesName("  Vulpes  ")).toBe(true);
    });

    it("matches keywords case-insensitively", () => {
      expect(looksLikeSpeciesName("COMBIEN d'oiseaux")).toBe(false);
    });

    it("rejects accented and unaccented variants of menacé/protégé", () => {
      expect(looksLikeSpeciesName("oiseaux menaces")).toBe(false);
      expect(looksLikeSpeciesName("oiseaux protégés")).toBe(false);
    });
  });
});
