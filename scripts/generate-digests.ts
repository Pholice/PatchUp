import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DIGEST_MODEL, DIGEST_VERSION, generatePatchDigest } from "@/lib/digest";
import type { Game, Patch, PatchDigest } from "@/lib/types";

interface GameConfig {
  game: Game;
  patchesPath: string;
  digestsPath: string;
}

const GAMES: GameConfig[] = [
  {
    game: "valorant",
    patchesPath: join(process.cwd(), "data/valorant/patches.json"),
    digestsPath: join(process.cwd(), "data/valorant/digests.json"),
  },
  {
    game: "lol",
    patchesPath: join(process.cwd(), "data/lol/patches.json"),
    digestsPath: join(process.cwd(), "data/lol/digests.json"),
  },
];

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

function writeJson(path: string, value: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, path);
}

export function needsDigest(patch: Patch, digest: PatchDigest | undefined): boolean {
  if (!digest) return true;
  return (
    digest.source_content_hash !== patch.content_hash ||
    digest.digest_version !== DIGEST_VERSION ||
    digest.model !== DIGEST_MODEL ||
    digest.text.trim().length === 0
  );
}

export function mergeDigest(existing: PatchDigest[], next: PatchDigest): PatchDigest[] {
  const byVersion = new Map(existing.map((digest) => [digest.version, digest]));
  byVersion.set(next.version, next);
  return [...byVersion.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function selectedGames(): GameConfig[] {
  const gameArgIndex = process.argv.indexOf("--game");
  if (gameArgIndex === -1) return GAMES;

  const game = process.argv[gameArgIndex + 1] as Game | undefined;
  if (game !== "valorant" && game !== "lol") {
    throw new Error('Expected --game to be either "valorant" or "lol"');
  }
  return GAMES.filter((config) => config.game === game);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateWithRetry(game: Game, patch: Patch, maxRetries = 5): Promise<PatchDigest> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await generatePatchDigest(game, patch);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && attempt < maxRetries) {
        const delay = Math.min(15_000 * (attempt + 1), 60_000);
        console.log(`  rate limited — waiting ${delay / 1000}s before retry ${attempt + 1}/${maxRetries}...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

async function generateForGame(config: GameConfig): Promise<{ game: Game; generated: string[] }> {
  const patches = readJson<Patch[]>(config.patchesPath, []);
  let digests = readJson<PatchDigest[]>(config.digestsPath, []);
  const digestsByVersion = new Map(digests.map((digest) => [digest.version, digest]));
  const generated: string[] = [];
  const needed = patches.filter((p) => needsDigest(p, digestsByVersion.get(p.version)));

  for (let i = 0; i < needed.length; i++) {
    const patch = needed[i];
    console.log(`[${config.game}] ${i + 1}/${needed.length} — patch ${patch.version}`);
    const next = await generateWithRetry(config.game, patch);
    digests = mergeDigest(digests, next);
    digestsByVersion.set(next.version, next);
    generated.push(next.version);
    writeJson(config.digestsPath, digests);
    if (i < needed.length - 1) await sleep(13_000);
  }

  return { game: config.game, generated };
}

async function main() {
  for (const config of selectedGames()) {
    const result = await generateForGame(config);
    if (result.generated.length === 0) {
      console.log(`[${result.game}] no digests needed`);
    } else {
      console.log(`[${result.game}] generated digests: ${result.generated.join(", ")}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
