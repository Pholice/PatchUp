import { describe, expect, it } from "vitest";
import { shouldRefreshPatch } from "./fetch-patches";
import type { Patch } from "@/lib/types";

const patch = (overrides: Partial<Patch> = {}): Patch => ({
  version: "12.01",
  date: "2026-01-01",
  locale: "en-us",
  url: "https://example.com/patch",
  fetched_at: "2026-05-27T00:00:00Z",
  parser_version: "test-v1",
  content_hash: "abc123",
  sections: [{ title: "Changes", items: ["A change"] }],
  raw_text: "A change",
  ...overrides,
});

describe("shouldRefreshPatch", () => {
  it("refreshes missing patches", () => {
    expect(shouldRefreshPatch(undefined, false)).toBe(true);
  });

  it("refreshes recent patches", () => {
    expect(shouldRefreshPatch(patch(), true)).toBe(true);
  });

  it("refreshes patches with empty extracted content", () => {
    expect(shouldRefreshPatch(patch({ sections: [], raw_text: "" }), false)).toBe(true);
  });

  it("skips old patches that already have content", () => {
    expect(shouldRefreshPatch(patch(), false)).toBe(false);
  });
});
