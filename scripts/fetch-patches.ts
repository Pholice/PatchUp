import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Patch, Game } from "@/lib/types";
import type { PatchParser } from "./parsers/types";
import { valorantParser } from "./parsers/valorant";
import { lolParser } from "./parsers/lol";

interface GameConfig {
  game: Game;
  indexUrl: string;
  parser: PatchParser;
  dataPath: string;
}

const GAMES: GameConfig[] = [
  {
    game: "valorant",
    indexUrl: "https://playvalorant.com/en-us/news/tags/patch-notes/",
    parser: valorantParser,
    dataPath: join(process.cwd(), "data/valorant/patches.json"),
  },
  {
    game: "lol",
    indexUrl: "https://www.leagueoflegends.com/en-us/news/tags/patch-notes/",
    parser: lolParser,
    dataPath: join(process.cwd(), "data/lol/patches.json"),
  },
];

const REFRESH_EXISTING_COUNT = 10;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "PatchUp/0.1 (+https://github.com/Pholice/PatchUp)" },
  });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return res.text();
}

function loadExisting(dataPath: string): Patch[] {
  return JSON.parse(readFileSync(dataPath, "utf-8")) as Patch[];
}

function save(dataPath: string, patches: Patch[]): void {
  const sorted = [...patches].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  writeFileSync(dataPath, JSON.stringify(sorted, null, 2) + "\n");
}

async function ingest(cfg: GameConfig): Promise<{ game: Game; added: string[]; changed: string[] }> {
  const existing = loadExisting(cfg.dataPath);
  const existingByVersion = new Map(existing.map((p) => [p.version, p]));

  const indexHtml = await fetchText(cfg.indexUrl);
  const entries = cfg.parser.listPatches(indexHtml);

  const added: string[] = [];
  const changed: string[] = [];
  const updatedByVersion = new Map(existingByVersion);
  const recentExistingVersions = new Set(
    [...existing]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, REFRESH_EXISTING_COUNT)
      .map((p) => p.version)
  );

  for (const entry of entries) {
    const existingPatch = existingByVersion.get(entry.version);
    const shouldFetch = !existingPatch || recentExistingVersions.has(entry.version);
    if (!shouldFetch) continue;

    const patchHtml = await fetchText(entry.url);
    const parsed = cfg.parser.parsePatch(entry, patchHtml);

    if (!existingPatch) {
      added.push(parsed.version);
      updatedByVersion.set(parsed.version, parsed);
      continue;
    }

    const changedContent =
      existingPatch.content_hash !== parsed.content_hash ||
      existingPatch.parser_version !== parsed.parser_version ||
      existingPatch.date !== parsed.date ||
      existingPatch.url !== parsed.url;

    if (changedContent) {
      changed.push(parsed.version);
      updatedByVersion.set(parsed.version, parsed);
    }
  }

  if (added.length > 0 || changed.length > 0) {
    save(cfg.dataPath, [...updatedByVersion.values()]);
  }
  return { game: cfg.game, added, changed };
}

async function main() {
  for (const cfg of GAMES) {
    const result = await ingest(cfg);
    if (result.added.length === 0 && result.changed.length === 0) {
      console.log(`[${result.game}] no new patches`);
    } else {
      if (result.added.length > 0) console.log(`[${result.game}] added: ${result.added.join(", ")}`);
      if (result.changed.length > 0) console.log(`[${result.game}] updated: ${result.changed.join(", ")}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
