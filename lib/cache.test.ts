import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheKey, readSummary, summaryFingerprint } from "./cache";
import type { PatchDigest } from "./types";

const headMock = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({
  head: headMock,
  put: vi.fn(),
}));

const digest = (version: string, text: string): PatchDigest => ({
  game: "lol",
  version,
  date: "2026-05-01",
  source_content_hash: `${version}-source`,
  digest_version: "patch-digest-v1",
  model: "claude-haiku-4-5-20251001",
  generated_at: "2026-05-29T00:00:00Z",
  text,
});

describe("summary cache", () => {
  beforeEach(() => {
    headMock.mockReset();
    vi.restoreAllMocks();
  });

  it("builds exact fingerprinted cache keys", () => {
    expect(cacheKey("valorant", "12.01", "12.02", "abc123")).toBe(
      "summaries/valorant/12.01_12.02/abc123.txt"
    );
  });

  it("changes the fingerprint when patch content changes", () => {
    const first = summaryFingerprint({
      model: "claude-sonnet-4-20250514",
      promptVersion: "returning-player-v1",
      digests: [digest("12.01", "digest a")],
    });
    const second = summaryFingerprint({
      model: "claude-sonnet-4-20250514",
      promptVersion: "returning-player-v1",
      digests: [digest("12.01", "digest b")],
    });

    expect(first).not.toBe(second);
  });

  it("reads a cached summary by exact blob key", async () => {
    headMock.mockResolvedValue({ url: "https://blob.example/summary.txt" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("cached summary", { status: 200 })
    );

    await expect(readSummary("summaries/lol/1_2/hash.txt")).resolves.toBe("cached summary");
    expect(headMock).toHaveBeenCalledWith("summaries/lol/1_2/hash.txt");
  });
});
