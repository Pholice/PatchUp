import { describe, expect, it } from "vitest";
import { MODEL, buildUserMessage } from "./claude";
import type { PatchDigest } from "./types";

const digest = (version: string, text: string): PatchDigest => ({
  game: "lol",
  version,
  date: "2026-05-27",
  source_content_hash: `${version}-hash`,
  digest_version: "patch-digest-v1",
  model: "claude-haiku-4-5-20251001",
  generated_at: "2026-05-29T00:00:00Z",
  text,
});

describe("Claude model configuration", () => {
  it("uses the pinned Claude Sonnet 4 API model id", () => {
    expect(MODEL).toBe("claude-sonnet-4-6");
  });
});

describe("buildUserMessage", () => {
  it("builds the final summary prompt from compact patch digests", () => {
    const prompt = buildUserMessage("lol", [
      digest("26.10", "ADC item changes made on-hit builds stronger."),
      digest("26.11", "Tank items were buffed for front-line durability."),
    ]);

    expect(prompt).toContain("Patch digests missed (2): 26.10, 26.11");
    expect(prompt).toContain("ADC item changes made on-hit builds stronger.");
    expect(prompt).toContain("Tank items were buffed for front-line durability.");
    expect(prompt).toContain("Meta Snapshot");
  });
});
