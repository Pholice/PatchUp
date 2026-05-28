import { describe, expect, it } from "vitest";
import { resolveDateToRange, loadPatches } from "./patches";
import type { Patch } from "./types";

const mkPatch = (version: string, date: string): Patch => ({
  version,
  date,
  locale: "en-us",
  url: `https://example.com/${version}`,
  fetched_at: "2026-05-27T00:00:00Z",
  parser_version: "test-v1",
  content_hash: `${version}-hash`,
  sections: [],
  raw_text: "",
});

const patches: Patch[] = [
  mkPatch("10.04", "2025-02-25"),
  mkPatch("10.05", "2025-03-11"),
  mkPatch("10.06", "2025-03-25"),
  mkPatch("10.07", "2025-04-08"),
  mkPatch("10.08", "2025-04-22"),
];

describe("resolveDateToRange", () => {
  it("returns patches strictly after the given date", () => {
    const range = resolveDateToRange(patches, new Date("2025-03-15"));
    expect(range.patches.map((p) => p.version)).toEqual(["10.06", "10.07", "10.08"]);
    expect(range.fromVersion).toBe("10.06");
    expect(range.toVersion).toBe("10.08");
  });

  it("returns all patches when date is before earliest", () => {
    const range = resolveDateToRange(patches, new Date("2020-01-01"));
    expect(range.patches).toHaveLength(5);
    expect(range.fromVersion).toBe("10.04");
    expect(range.toVersion).toBe("10.08");
  });

  it("returns empty range when date is after latest", () => {
    const range = resolveDateToRange(patches, new Date("2026-01-01"));
    expect(range.patches).toHaveLength(0);
    expect(range.fromVersion).toBe("");
    expect(range.toVersion).toBe("");
  });

  it("handles a date exactly equal to a patch date (excludes that patch)", () => {
    const range = resolveDateToRange(patches, new Date(2025, 2, 25));
    expect(range.patches.map((p) => p.version)).toEqual(["10.07", "10.08"]);
  });
});

describe("loadPatches", () => {
  it("returns an array for 'valorant'", () => {
    const result = loadPatches("valorant");
    expect(Array.isArray(result)).toBe(true);
  });
  it("returns an array for 'lol'", () => {
    const result = loadPatches("lol");
    expect(Array.isArray(result)).toBe(true);
  });
});
