import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { Patch } from "@/lib/types";
import type { PatchListEntry, PatchParser } from "./types";

const PARSER_VERSION = "valorant-v1";

function extractNextData(html: string): Record<string, unknown> {
  const $ = cheerio.load(html);
  const scriptText = $("script#__NEXT_DATA__").text();
  return JSON.parse(scriptText) as Record<string, unknown>;
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
  // Actual path: data.props.pageProps.page.blades
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blades = (data as any).props?.pageProps?.page?.blades as any[];
  if (!blades) return [];

  // Find the blade with type "articleCardGrid" or containing items array
  let articles: unknown[] = [];
  for (const blade of blades) {
    if (blade.type === "articleCardGrid" && Array.isArray(blade.items)) {
      articles = blade.items;
      break;
    }
    // Fallback: blade has articleCardGrid sub-object (per task description)
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

    // Filter to patch notes only
    if (!title.toLowerCase().includes("patch note")) continue;

    const version = parseVersion(title);
    if (!version || !href || !dateRaw) continue;

    const url = href.startsWith("http")
      ? href
      : `https://playvalorant.com${href}`;

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
      if (blade.type === "articleRichText" && blade.richText?.body) {
        bodyHtml = blade.richText.body;
        break;
      }
      // Fallback: blade has articleRichText sub-object (per task description)
      if (blade.articleRichText?.richText?.body) {
        bodyHtml = blade.articleRichText.richText.body;
        break;
      }
    }
  }

  // Parse the body HTML to extract sections
  const $ = cheerio.load(bodyHtml);
  const sections: Patch["sections"] = [];
  let current: { title: string; items: string[] } | null = null;

  // Process top-level elements in document order
  $("h2, h3, h4, ul, li").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().trim();
    if (!text) return;

    if (tag === "h2" || tag === "h3" || tag === "h4") {
      if (current) sections.push(current);
      current = { title: text, items: [] };
    } else if (tag === "li") {
      // Only process top-level li items (direct children of top-level ul)
      // Check if this li is a direct child of a top-level ul (not nested)
      const parent = $(el).parent();
      const grandparent = parent.parent();
      // grandparent is the root/body for top-level uls
      const isTopLevel =
        grandparent.is("body") ||
        grandparent.prop("tagName") === undefined ||
        grandparent.is("html");

      if (isTopLevel && current) {
        // Get the text of just this li, not its nested ul children
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

  // If no filled sections found (e.g., all items are nested), fall back to
  // collecting all direct li items under each heading
  if (filledSections.length === 0 && sections.length > 0) {
    // Re-parse: collect all li items regardless of nesting level
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
        // Remove nested ul content and get only direct text
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

  return {
    version: entry.version,
    date: entry.date,
    locale: "en-us",
    url: entry.url,
    fetched_at: new Date().toISOString(),
    parser_version: PARSER_VERSION,
    content_hash: contentHash(sections, rawText),
    sections,
    raw_text: rawText,
  };
}

export const valorantParser: PatchParser = {
  parser_version: PARSER_VERSION,
  listPatches,
  parsePatch,
};
