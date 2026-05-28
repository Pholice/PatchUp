import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lolParser } from "./lol";

const indexHtml = readFileSync(
  join(__dirname, "../../__fixtures__/lol-index-sample.html"),
  "utf-8"
);
const patchHtml = readFileSync(
  join(__dirname, "../../__fixtures__/lol-patch-sample.html"),
  "utf-8"
);

describe("lolParser.listPatches", () => {
  it("returns at least one entry from the index page", () => {
    const list = lolParser.listPatches(indexHtml);
    expect(list.length).toBeGreaterThan(0);
  });

  it("returns entries with version, url, and date", () => {
    const list = lolParser.listPatches(indexHtml);
    for (const entry of list) {
      expect(entry.version).toMatch(/^\d+\.\d+/);
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("lolParser.parsePatch", () => {
  const entry = {
    version: "test",
    url: "https://www.leagueoflegends.com/en-us/news/game-updates/test/",
    date: "2026-05-01",
  };

  it("returns a Patch with required fields populated", () => {
    const patch = lolParser.parsePatch(entry, patchHtml);
    expect(patch.version).toBe("test");
    expect(patch.url).toBe(entry.url);
    expect(patch.parser_version).toBe(lolParser.parser_version);
    expect(patch.content_hash).toMatch(/^[a-f0-9]{16}$/);
    expect(patch.raw_text.length).toBeGreaterThan(100);
  });

  it("extracts at least one section with at least one item", () => {
    const patch = lolParser.parsePatch(entry, patchHtml);
    expect(patch.sections.length).toBeGreaterThan(0);
    expect(patch.sections[0].items.length).toBeGreaterThan(0);
  });
});
