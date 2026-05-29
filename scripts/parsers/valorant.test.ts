import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { valorantParser } from "./valorant";

const indexHtml = readFileSync(
  join(__dirname, "../../__fixtures__/valorant-index-sample.html"),
  "utf-8"
);
const patchHtml = readFileSync(
  join(__dirname, "../../__fixtures__/valorant-patch-sample.html"),
  "utf-8"
);

describe("valorantParser.listPatches", () => {
  it("returns at least one entry from the index page", () => {
    const list = valorantParser.listPatches(indexHtml);
    expect(list.length).toBeGreaterThan(0);
  });

  it("returns entries with version, url, and date", () => {
    const list = valorantParser.listPatches(indexHtml);
    for (const entry of list) {
      expect(entry.version).toMatch(/^\d+\.\d+/);
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("valorantParser.parsePatch", () => {
  const entry = {
    version: "test",
    url: "https://playvalorant.com/en-us/news/game-updates/test/",
    date: "2026-05-01",
  };

  it("returns a Patch with required fields populated", () => {
    const patch = valorantParser.parsePatch(entry, patchHtml);
    expect(patch.version).toBe("test");
    expect(patch.url).toBe(entry.url);
    expect(patch.date).toBe(entry.date);
    expect(patch.locale).toBe("en-us");
    expect(patch.parser_version).toBe(valorantParser.parser_version);
    expect(patch.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(patch.content_hash).toMatch(/^[a-f0-9]{16}$/);
    expect(patch.raw_text.length).toBeGreaterThan(100);
  });

  it("extracts at least one section with at least one item", () => {
    const patch = valorantParser.parsePatch(entry, patchHtml);
    expect(patch.sections.length).toBeGreaterThan(0);
    expect(patch.sections[0].items.length).toBeGreaterThan(0);
  });

  it("falls back to rendered article HTML when __NEXT_DATA__ lacks rich text", () => {
    const htmlWithoutNextData = patchHtml.replace(
      /<script id="__NEXT_DATA__" type="application\/json">[\s\S]*?<\/script>/,
      ""
    );

    const patch = valorantParser.parsePatch(entry, htmlWithoutNextData);

    expect(patch.raw_text.length).toBeGreaterThan(100);
    expect(patch.sections.length).toBeGreaterThan(0);
  });
});
