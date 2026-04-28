import { describe, it, expect } from "vitest";
import { z } from "zod";

const MAX_QUESTION_LENGTH = 500;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CONTENT = 2_000;

const askBodySchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(MAX_HISTORY_CONTENT),
      }),
    )
    .max(MAX_HISTORY_MESSAGES)
    .optional()
    .default([]),
});

describe("/api/ask body validation", () => {
  it("accepts a minimal valid body", () => {
    const r = askBodySchema.safeParse({ question: "Vulpes vulpes" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.history).toEqual([]);
  });

  it("trims the question", () => {
    const r = askBodySchema.safeParse({ question: "  Vulpes vulpes  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.question).toBe("Vulpes vulpes");
  });

  it("rejects missing question", () => {
    expect(askBodySchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty question", () => {
    expect(askBodySchema.safeParse({ question: "" }).success).toBe(false);
  });

  it("rejects whitespace-only question (after trim)", () => {
    expect(askBodySchema.safeParse({ question: "   " }).success).toBe(false);
  });

  it("rejects question longer than 500 chars", () => {
    expect(askBodySchema.safeParse({ question: "a".repeat(501) }).success).toBe(false);
  });

  it("accepts question exactly 500 chars", () => {
    expect(askBodySchema.safeParse({ question: "a".repeat(500) }).success).toBe(true);
  });

  it("rejects history with invalid role", () => {
    const r = askBodySchema.safeParse({
      question: "ok",
      history: [{ role: "system", content: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects history longer than 10 messages", () => {
    const history = Array.from({ length: 11 }, () => ({ role: "user" as const, content: "x" }));
    expect(askBodySchema.safeParse({ question: "ok", history }).success).toBe(false);
  });

  it("rejects history content > 2000 chars", () => {
    const r = askBodySchema.safeParse({
      question: "ok",
      history: [{ role: "user", content: "a".repeat(2001) }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a full conversation up to 10 messages", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: "hi",
    }));
    expect(askBodySchema.safeParse({ question: "ok", history }).success).toBe(true);
  });
});
