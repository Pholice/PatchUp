import { describe, expect, it } from "vitest";
import { needsDigest, mergeDigest } from "./generate-digests";
import type { Patch, PatchDigest } from "@/lib/types";

const patch = (version: string, contentHash: string): Patch => ({
  version,
  date: "2026-05-27",
  locale: "en-us",
  url: "https://example.com",
  fetched_at: "2026-05-29T00:00:00Z",
  parser_version: "test-v1",
  content_hash: contentHash,
  sections: [{ title: "Changes", items: ["A gameplay change"] }],
  raw_text: "A gameplay change",
});

const digest = (version: string, contentHash: string): PatchDigest => ({
  game: "valorant",
  version,
  date: "2026-05-27",
  source_content_hash: contentHash,
  digest_version: "patch-digest-v1",
  model: "claude-haiku-4-5-20251001",
  generated_at: "2026-05-29T00:00:00Z",
  text: "Digest text",
});

describe("needsDigest", () => {
  it("returns true when digest is missing", () => {
    expect(needsDigest(patch("12.10", "hash-a"), undefined)).toBe(true);
  });

  it("returns true when source content hash changed", () => {
    expect(needsDigest(patch("12.10", "hash-b"), digest("12.10", "hash-a"))).toBe(true);
  });

  it("returns false when digest matches patch content", () => {
    expect(needsDigest(patch("12.10", "hash-a"), digest("12.10", "hash-a"))).toBe(false);
  });

  it("returns true when digest_version changed", () => {
    const stale = { ...digest("12.10", "hash-a"), digest_version: "patch-digest-v0" };
    expect(needsDigest(patch("12.10", "hash-a"), stale)).toBe(true);
  });

  it("returns true when model changed", () => {
    const stale = { ...digest("12.10", "hash-a"), model: "claude-haiku-old" };
    expect(needsDigest(patch("12.10", "hash-a"), stale)).toBe(true);
  });

  it("returns true when digest text is empty", () => {
    const empty = { ...digest("12.10", "hash-a"), text: "   " };
    expect(needsDigest(patch("12.10", "hash-a"), empty)).toBe(true);
  });
});

describe("mergeDigest", () => {
  it("replaces an existing digest for the same version", () => {
    const merged = mergeDigest([digest("12.09", "old"), digest("12.10", "old")], digest("12.10", "new"));

    expect(merged).toHaveLength(2);
    expect(merged.find((entry) => entry.version === "12.10")?.source_content_hash).toBe("new");
  });
});
