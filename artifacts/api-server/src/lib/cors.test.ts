import { describe, it, expect } from "vitest";

const ALLOWED_ORIGIN_HOSTS = [
  /\.replit\.dev$/,
  /\.replit\.app$/,
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
];

function isAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    return ALLOWED_ORIGIN_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

describe("CORS allowlist", () => {
  it("allows same-origin (no Origin header)", () => {
    expect(isAllowed(undefined)).toBe(true);
  });

  it("allows replit.dev preview domains", () => {
    expect(isAllowed("https://abc-def.replit.dev")).toBe(true);
    expect(isAllowed("https://1234-deadbeef.janeway.replit.dev")).toBe(true);
  });

  it("allows replit.app published domain", () => {
    expect(isAllowed("https://ali-species.replit.app")).toBe(true);
  });

  it("allows localhost with any port", () => {
    expect(isAllowed("http://localhost")).toBe(true);
    expect(isAllowed("http://localhost:3000")).toBe(true);
    expect(isAllowed("http://127.0.0.1:5000")).toBe(true);
  });

  it("blocks arbitrary third-party origins", () => {
    expect(isAllowed("https://evil.example.com")).toBe(false);
    expect(isAllowed("https://attacker.com")).toBe(false);
    expect(isAllowed("http://repl.it.attacker.com")).toBe(false);
  });

  it("blocks malformed Origin headers", () => {
    expect(isAllowed("not a url")).toBe(false);
    expect(isAllowed("javascript:alert(1)")).toBe(false);
  });

  it("blocks suffix-injection attempts", () => {
    // Domain that *contains* replit.dev but isn't a subdomain of it
    expect(isAllowed("https://replit.dev.attacker.com")).toBe(false);
  });
});
