import { describe, expect, it } from "vitest";
import { DIGEST_MODEL, DIGEST_VERSION, buildDigestPrompt, normalizeDigestText } from "./digest";
import type { Patch } from "./types";

const patch: Patch = {
  version: "12.10",
  date: "2026-05-27",
  locale: "en-us",
  url: "https://example.com/patch",
  fetched_at: "2026-05-29T00:00:00Z",
  parser_version: "valorant-v1",
  content_hash: "abc123",
  sections: [
    { title: "Agent Updates", items: ["Jett dash cooldown increased"] },
    { title: "Bug Fixes", items: ["Fixed rare UI flicker"] },
  ],
  raw_text: "Full patch text",
};

describe("digest config", () => {
  it("uses Haiku for digest generation", () => {
    expect(DIGEST_MODEL).toBe("claude-haiku-4-5-20251001");
    expect(DIGEST_VERSION).toBe("patch-digest-v1");
  });
});

describe("buildDigestPrompt", () => {
  it("includes patch identity and parsed sections", () => {
    const prompt = buildDigestPrompt("valorant", patch);

    expect(prompt).toContain("Game: valorant");
    expect(prompt).toContain("Patch: 12.10");
    expect(prompt).toContain("Agent Updates");
    expect(prompt).toContain("Jett dash cooldown increased");
  });

  it("instructs the model to stay compact and gameplay-focused", () => {
    const prompt = buildDigestPrompt("valorant", patch);

    expect(prompt).toContain("under 400 tokens");
    expect(prompt).toContain("Skip cosmetics");
    expect(prompt).toContain("bug fixes");
  });
});

describe("normalizeDigestText", () => {
  it("trims text and collapses excessive blank lines", () => {
    expect(normalizeDigestText("  A\n\n\nB  ")).toBe("A\n\nB");
  });
});
