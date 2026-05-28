import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { Patch } from "@/lib/types";
import type { PatchListEntry, PatchParser } from "./types";

const PARSER_VERSION = "lol-v1";
const BASE_URL = "https://www.leagueoflegends.com";

function extractNextData(html: string): Record<string, unknown> {
  const $ = cheerio.load(html);
  const scriptText = $("script#__NEXT_DATA__").text();
  if (!scriptText) throw new Error("__NEXT_DATA__ script not found in page HTML");
  try {
    return JSON.parse(scriptText) as Record<string, unknown>;
  } catch {
    throw new Error("Failed to parse __NEXT_DATA__ JSON");
  }
}

function parseVersion(title: string): string | null {
  const match = title.match(/(\d+\.\d+)/);
  return match ? match[1] : null;
}

function parseDate(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable date: ${raw}`);
  return d.toISOString().slice(0, 10);
}

function contentHash(sections: Patch["sections"], rawText: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ sections, raw_text: rawText }))
    .digest("hex")
    .slice(0, 16);
}

function listPatches(indexHtml: string): PatchListEntry[] {
  const data = extractNextData(indexHtml);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blades = (data as any).props?.pageProps?.page?.blades as any[];
  if (!blades) return [];

  // Find the blade with type "articleCardGrid"
  let articles: unknown[] = [];
  for (const blade of blades) {
    if (blade.type === "articleCardGrid" && Array.isArray(blade.items)) {
      articles = blade.items;
      break;
    }
    // Fallback: blade has articleCardGrid sub-object
    if (blade.articleCardGrid?.articles) {
      articles = blade.articleCardGrid.articles;
      break;
    }
  }

  const entries: PatchListEntry[] = [];
  for (const article of articles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = article as any;
    const title: string = a.title ?? "";
    const href: string = a.action?.payload?.url ?? "";
    const dateRaw: string = a.publishedAt ?? "";

    // Filter to patch notes only (must contain "patch" in title)
    if (!title.toLowerCase().includes("patch")) continue;

    const version = parseVersion(title);
    if (!version || !href || !dateRaw) continue;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    try {
      entries.push({ version, url, date: parseDate(dateRaw) });
    } catch {
      // skip entries with unparseable dates
    }
  }

  return entries;
}

function parsePatch(entry: PatchListEntry, patchHtml: string): Patch {
  const data = extractNextData(patchHtml);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blades = (data as any).props?.pageProps?.page?.blades as any[];

  let bodyHtml = "";
  if (blades) {
    for (const blade of blades) {
      // LoL patch pages use "patchNotesRichText" blade type
      // The body is at blade.richText.body (confirmed from fixture inspection)
      if (blade.type === "patchNotesRichText" && blade.richText?.body) {
        bodyHtml = blade.richText.body;
        break;
      }
      // Fallback: nested under blade.patchNotesRichText
      if (blade.patchNotesRichText?.richText?.body) {
        bodyHtml = blade.patchNotesRichText.richText.body;
        break;
      }
    }
  }

  // Parse the body HTML to extract sections
  const $ = cheerio.load(bodyHtml);
  const sections: Patch["sections"] = [];
  let current: { title: string; items: string[] } | null = null;

  // Process elements in document order
  $("h2, h3, h4, li").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().trim();
    if (!text) return;

    if (tag === "h2" || tag === "h3" || tag === "h4") {
      if (current) sections.push(current);
      current = { title: text, items: [] };
    } else if (tag === "li") {
      // Only process top-level li items (direct children of top-level ul)
      const parent = $(el).parent();
      const grandparent = parent.parent();
      const isTopLevel =
        grandparent.is("body") ||
        grandparent.prop("tagName") === undefined ||
        grandparent.is("html");

      if (isTopLevel && current) {
        const cloned = $(el).clone();
        cloned.find("ul").remove();
        const itemText = cloned.text().trim();
        if (itemText) current.items.push(itemText);
      }
    }
  });
  if (current) sections.push(current);

  // Filter out sections with no items
  const filledSections = sections.filter((s) => s.items.length > 0);

  // Fallback: collect all li items regardless of nesting if no filled sections
  if (filledSections.length === 0 && sections.length > 0) {
    const fallbackSections: Patch["sections"] = [];
    let fallbackCurrent: { title: string; items: string[] } | null = null;

    $("h2, h3, h4, li").each((_, el) => {
      const tag = el.tagName.toLowerCase();
      const text = $(el).text().trim();
      if (!text) return;

      if (tag === "h2" || tag === "h3" || tag === "h4") {
        if (fallbackCurrent) fallbackSections.push(fallbackCurrent);
        fallbackCurrent = { title: text, items: [] };
      } else if (tag === "li" && fallbackCurrent) {
        const cloned = $(el).clone();
        cloned.find("ul").remove();
        const itemText = cloned.text().trim();
        if (itemText) fallbackCurrent.items.push(itemText);
      }
    });
    if (fallbackCurrent) fallbackSections.push(fallbackCurrent);
    return buildPatch(entry, fallbackSections.filter((s) => s.items.length > 0), $);
  }

  return buildPatch(entry, filledSections, $);
}

function buildPatch(
  entry: PatchListEntry,
  sections: Patch["sections"],
  $: ReturnType<typeof cheerio.load>
): Patch {
  const rawText = $.root().text().replace(/\s+/g, " ").trim();

  const localeMatch = entry.url.match(/leagueoflegends\.com\/([a-z]{2}-[a-z]{2})\//);
  const locale = localeMatch?.[1] ?? "en-us";

  return {
    version: entry.version,
    date: entry.date,
    locale,
    url: entry.url,
    fetched_at: new Date().toISOString(),
    parser_version: PARSER_VERSION,
    content_hash: contentHash(sections, rawText),
    sections,
    raw_text: rawText,
  };
}

export const lolParser: PatchParser = {
  parser_version: PARSER_VERSION,
  listPatches,
  parsePatch,
};
