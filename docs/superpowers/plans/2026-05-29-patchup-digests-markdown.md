# PatchUp Digest Pipeline and Markdown Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce long-gap summary prompt size by storing local Haiku-generated per-patch digests, then render final Sonnet Markdown summaries in a polished, scannable UI.

**Architecture:** Riot patch scraping remains the source-of-truth ingestion layer. A separate digest generation script reads committed patch JSON, calls Claude Haiku only for new or changed patch content, and writes `data/<game>/digests.json`. The summarize API resolves the user's patch range, loads matching local digests, sends those compact digests to Sonnet for the final streamed Markdown briefing, and the frontend renders streamed Markdown with `react-markdown`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, `@anthropic-ai/sdk`, Vercel Blob, `react-markdown`, `remark-gfm`, GitHub Actions.

---

## File Structure

```
patchup/
  lib/
    types.ts                    ← add PatchDigest
    patches.ts                  ← add loadDigests and resolveDigestsForRange
    patches.test.ts             ← tests for digest range lookup
    claude.ts                   ← final Sonnet summary uses digests
    claude.test.ts              ← prompt construction tests
    digest.ts                   ← Haiku digest generation helper
    digest.test.ts              ← digest prompt/cache tests

  scripts/
    generate-digests.ts         ← generate missing/stale digest JSON
    generate-digests.test.ts    ← test stale/missing detection

  data/
    valorant/digests.json       ← committed digest data
    lol/digests.json            ← committed digest data

  components/
    SummaryView.tsx             ← render Markdown with component mapping
    SummaryView.test.tsx        ← Markdown render tests

  package.json                  ← add dependencies/scripts
  .github/workflows/fetch-patches.yml ← run digests after patch fetch
```

**Boundary decisions:**
- `patches.json` remains the raw structured source of truth.
- `digests.json` is AI-enriched derived data, committed so user requests do not pay Haiku costs.
- `lib/digest.ts` owns Haiku prompt/model details.
- `lib/claude.ts` owns final Sonnet prompt/model details.
- `SummaryView.tsx` renders Markdown; it does not parse game semantics.

---

## Task 1: Add Markdown Rendering Dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`, `vitest.config.ts`

- [ ] **Step 1: Install Markdown packages**

Run:

```bash
npm install react-markdown remark-gfm
```

Expected: `package.json` includes `react-markdown` and `remark-gfm`, and `package-lock.json` updates.

- [ ] **Step 2: Configure Vitest for ESM Markdown packages**

Modify `vitest.config.ts` so the test config includes `server.deps.inline`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    server: {
      deps: {
        inline: ["react-markdown", "remark-gfm"],
      },
    },
  },
});
```

This is required because `react-markdown` and `remark-gfm` are ESM packages.

- [ ] **Step 3: Verify install did not break tests**

Run:

```bash
npm test
```

Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add markdown rendering dependencies"
```

---

## Task 2: Add Patch Digest Types and Seed Digest Files

**Files:**
- Modify: `lib/types.ts`
- Create: `data/valorant/digests.json`, `data/lol/digests.json`

- [ ] **Step 1: Add `PatchDigest` to `lib/types.ts`**

Add this interface after `Patch`:

```ts
export interface PatchDigest {
  game: Game;
  version: string;
  date: string;
  source_content_hash: string;
  digest_version: string;
  model: string;
  generated_at: string;
  text: string;
}
```

- [ ] **Step 2: Seed empty digest files**

Create `data/valorant/digests.json`:

```json
[]
```

Create `data/lol/digests.json`:

```json
[]
```

- [ ] **Step 3: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: TypeScript passes.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts data/valorant/digests.json data/lol/digests.json
git commit -m "feat: add patch digest data model"
```

---

## Task 3: Load Digests for a Patch Range

**Files:**
- Modify: `lib/patches.ts`, `lib/patches.test.ts`

- [ ] **Step 1: Add failing tests in `lib/patches.test.ts`**

Add imports:

```ts
import { resolveDigestsForRange } from "./patches";
import type { PatchDigest } from "./types";
```

Add this helper below `mkPatch`:

```ts
const mkDigest = (version: string, date: string): PatchDigest => ({
  game: "lol",
  version,
  date,
  source_content_hash: `${version}-hash`,
  digest_version: "patch-digest-v1",
  model: "claude-haiku-4-5-20251001",
  generated_at: "2026-05-29T00:00:00Z",
  text: `Digest ${version}`,
});
```

Add these tests:

```ts
describe("resolveDigestsForRange", () => {
  const range = {
    fromVersion: "10.06",
    toVersion: "10.08",
    patches: [
      mkPatch("10.06", "2025-03-25"),
      mkPatch("10.07", "2025-04-08"),
      mkPatch("10.08", "2025-04-22"),
    ],
  };

  it("returns digests in patch range order", () => {
    const digests = [
      mkDigest("10.08", "2025-04-22"),
      mkDigest("10.06", "2025-03-25"),
      mkDigest("10.07", "2025-04-08"),
    ];

    expect(resolveDigestsForRange(range, digests).map((d) => d.version)).toEqual([
      "10.06",
      "10.07",
      "10.08",
    ]);
  });

  it("throws when a patch is missing a digest", () => {
    const digests = [mkDigest("10.06", "2025-03-25")];

    expect(() => resolveDigestsForRange(range, digests)).toThrow(
      "Missing digest for patch 10.07"
    );
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- lib/patches.test.ts
```

Expected: FAIL because `resolveDigestsForRange` does not exist.

- [ ] **Step 3: Implement digest loading in `lib/patches.ts`**

Add imports:

```ts
import type { Game, Patch, PatchDigest, PatchRange } from "./types";
import valorantDigestData from "@/data/valorant/digests.json";
import lolDigestData from "@/data/lol/digests.json";
```

Replace the current `import type` line with the combined type import above, and add:

```ts
const DIGESTS: Record<Game, PatchDigest[]> = {
  valorant: valorantDigestData as PatchDigest[],
  lol: lolDigestData as PatchDigest[],
};

export function loadDigests(game: Game): PatchDigest[] {
  return [...DIGESTS[game]].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function resolveDigestsForRange(
  range: Omit<PatchRange, "game">,
  digests: PatchDigest[]
): PatchDigest[] {
  const byVersion = new Map(digests.map((digest) => [digest.version, digest]));
  return range.patches.map((patch) => {
    const digest = byVersion.get(patch.version);
    if (!digest) throw new Error(`Missing digest for patch ${patch.version}`);
    return digest;
  });
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```bash
npm test -- lib/patches.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/patches.ts lib/patches.test.ts
git commit -m "feat: load patch digests for resolved ranges"
```

---

## Task 4: Add Haiku Digest Generation Helper

**Files:**
- Create: `lib/digest.ts`, `lib/digest.test.ts`

- [ ] **Step 1: Write failing tests in `lib/digest.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { DIGEST_MODEL, DIGEST_VERSION, buildDigestPrompt, normalizeDigestText } from "./digest";
import type { Patch } from "./types";

const patch: Patch = {
  version: "12.10",
  date: "2026-05-27",
  locale: "en-us",
  url: "https://example.com/patch",
  fetched_at: "2026-05-29T00:00:00Z",
  parser_version: "valorant-v1",
  content_hash: "abc123",
  sections: [
    { title: "Agent Updates", items: ["Jett dash cooldown increased"] },
    { title: "Bug Fixes", items: ["Fixed rare UI flicker"] },
  ],
  raw_text: "Full patch text",
};

describe("digest config", () => {
  it("uses Haiku for digest generation", () => {
    expect(DIGEST_MODEL).toBe("claude-haiku-4-5-20251001");
    expect(DIGEST_VERSION).toBe("patch-digest-v1");
  });
});

describe("buildDigestPrompt", () => {
  it("includes patch identity and parsed sections", () => {
    const prompt = buildDigestPrompt("valorant", patch);

    expect(prompt).toContain("Game: valorant");
    expect(prompt).toContain("Patch: 12.10");
    expect(prompt).toContain("Agent Updates");
    expect(prompt).toContain("Jett dash cooldown increased");
  });

  it("instructs the model to stay compact and gameplay-focused", () => {
    const prompt = buildDigestPrompt("valorant", patch);

    expect(prompt).toContain("under 400 tokens");
    expect(prompt).toContain("Skip cosmetics");
    expect(prompt).toContain("bug fixes");
  });
});

describe("normalizeDigestText", () => {
  it("trims text and collapses excessive blank lines", () => {
    expect(normalizeDigestText("  A\n\n\nB  ")).toBe("A\n\nB");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- lib/digest.test.ts
```

Expected: FAIL because `lib/digest.ts` does not exist.

- [ ] **Step 3: Implement `lib/digest.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { Game, Patch, PatchDigest } from "./types";

export const DIGEST_MODEL = "claude-haiku-4-5-20251001";
export const DIGEST_VERSION = "patch-digest-v1";

const DIGEST_SYSTEM_PROMPT = `You write compact game patch digests for returning players.
Focus on gameplay, meta, build, character, item, map, rune, mode, and system changes.
Skip cosmetics, esports, client-only notes, and minor bug fixes unless they materially affect gameplay.
Write Markdown. Keep the digest under 400 tokens.`;

export function buildDigestPrompt(game: Game, patch: Patch): string {
  const sections =
    patch.sections.length > 0
      ? patch.sections
          .map((section) => `## ${section.title}\n${section.items.map((item) => `- ${item}`).join("\n")}`)
          .join("\n\n")
      : patch.raw_text;

  return `Game: ${game}
Patch: ${patch.version}
Patch date: ${patch.date}

Create a compact digest for this patch.
Requirements:
- Keep it under 400 tokens.
- Group by practical gameplay category when useful.
- Preserve concrete champion/agent/item/rune/map/system names.
- Skip cosmetics, esports, and minor bug fixes unless gameplay-relevant.
- Mention if the patch appears very small.

Patch notes:
${sections}`;
}

export function normalizeDigestText(text: string): string {
  return text.trim().replace(/\n{3,}/g, "\n\n");
}

export async function generatePatchDigest(game: Game, patch: Patch): Promise<PatchDigest> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: DIGEST_MODEL,
    max_tokens: 700,
    system: DIGEST_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildDigestPrompt(game, patch) }],
  });

  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return {
    game,
    version: patch.version,
    date: patch.date,
    source_content_hash: patch.content_hash,
    digest_version: DIGEST_VERSION,
    model: DIGEST_MODEL,
    generated_at: new Date().toISOString(),
    text: normalizeDigestText(text),
  };
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
npm test -- lib/digest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/digest.ts lib/digest.test.ts
git commit -m "feat: add Haiku patch digest helper"
```

---

## Task 5: Add Digest Generation Script

**Files:**
- Create: `scripts/generate-digests.ts`, `scripts/generate-digests.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing tests in `scripts/generate-digests.test.ts`**

```ts
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
});

describe("mergeDigest", () => {
  it("replaces an existing digest for the same version", () => {
    const merged = mergeDigest([digest("12.09", "old"), digest("12.10", "old")], digest("12.10", "new"));

    expect(merged).toHaveLength(2);
    expect(merged.find((entry) => entry.version === "12.10")?.source_content_hash).toBe("new");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- scripts/generate-digests.test.ts
```

Expected: FAIL because `scripts/generate-digests.ts` does not exist.

- [ ] **Step 3: Implement `scripts/generate-digests.ts`**

```ts
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

async function generateForGame(config: GameConfig): Promise<{ game: Game; generated: string[] }> {
  const patches = readJson<Patch[]>(config.patchesPath, []);
  let digests = readJson<PatchDigest[]>(config.digestsPath, []);
  const digestsByVersion = new Map(digests.map((digest) => [digest.version, digest]));
  const generated: string[] = [];
  const needed = patches.filter((patch) => needsDigest(patch, digestsByVersion.get(patch.version)));

  for (let i = 0; i < needed.length; i++) {
    const patch = needed[i];
    console.log(`[${config.game}] ${i + 1}/${needed.length} - patch ${patch.version}`);
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
  for (const config of GAMES) {
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
```

- [ ] **Step 4: Add optional per-game CLI filtering and generation backoff**

Add these helpers below `GAMES`:

```ts
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
        console.log(`  rate limited - waiting ${delay / 1000}s before retry ${attempt + 1}/${maxRetries}...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}
```

Change `main()` to:

```ts
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
```

- [ ] **Step 5: Add npm script**

In `package.json`, add:

```json
"generate-digests": "tsx scripts/generate-digests.ts"
```

The scripts block should include:

```json
"fetch-patches": "tsx scripts/fetch-patches.ts",
"generate-digests": "tsx scripts/generate-digests.ts"
```

- [ ] **Step 6: Run tests and verify they pass**

Run:

```bash
npm test -- scripts/generate-digests.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-digests.ts scripts/generate-digests.test.ts package.json package-lock.json
git commit -m "feat: add patch digest generation script"
```

---

## Task 6: Generate Initial Local Digests

**Files:**
- Modify: `data/valorant/digests.json`, `data/lol/digests.json`

- [ ] **Step 1: Ensure API key is present**

Run:

```bash
test -n "$ANTHROPIC_API_KEY"
```

Expected: exit code `0`. If this fails, load `.env.local` or export `ANTHROPIC_API_KEY` before continuing.

- [ ] **Step 2: Generate digests**

Run:

```bash
npm run generate-digests
```

Expected: script prints generated versions for Valorant and LoL. This may take several minutes on first run because every patch needs a digest.

If you want to generate one game at a time during the initial backfill, run:

```bash
npm run generate-digests -- --game valorant
npm run generate-digests -- --game lol
```

- [ ] **Step 3: Validate digest counts**

Run:

```bash
node -e "const fs=require('fs'); for (const g of ['valorant','lol']) { const p=JSON.parse(fs.readFileSync('data/'+g+'/patches.json','utf8')); const d=JSON.parse(fs.readFileSync('data/'+g+'/digests.json','utf8')); const empty=d.filter(x=>!x.text || !x.source_content_hash); console.log(g, 'patches', p.length, 'digests', d.length, 'empty', empty.length); if (p.length !== d.length || empty.length) process.exitCode = 1; }"
```

Expected: each game has matching patch and digest counts, with `empty 0`.

- [ ] **Step 4: Commit digest data**

```bash
git add data/valorant/digests.json data/lol/digests.json
git commit -m "chore: generate initial patch digests"
```

---

## Task 7: Use Digests in Final Sonnet Summaries

**Files:**
- Modify: `lib/claude.ts`, `lib/claude.test.ts`, `app/api/summarize/route.ts`, `lib/cache.ts`, `lib/cache.test.ts`

- [ ] **Step 1: Update `lib/claude.test.ts` for digest prompts**

Keep the existing `Claude model configuration` test. Replace the existing `describe("buildUserMessage", ...)` block, including the raw-patch fallback test, with the digest-based block below.

Add this import at the top:

```ts
import type { PatchDigest } from "./types";
```

Use this complete `describe("buildUserMessage", ...)` block:

```ts
const digest = (version: string, text: string): PatchDigest => ({
  game: "lol",
  version,
  date: "2026-05-27",
  source_content_hash: `${version}-hash`,
  digest_version: "patch-digest-v1",
  model: "claude-haiku-4-5-20251001",
  generated_at: "2026-05-29T00:00:00Z",
  text,
});

describe("buildUserMessage", () => {
  it("builds the final summary prompt from compact patch digests", () => {
    const prompt = buildUserMessage("lol", [
      digest("26.10", "ADC item changes made on-hit builds stronger."),
      digest("26.11", "Tank items were buffed for front-line durability."),
    ]);

    expect(prompt).toContain("Patch digests missed (2): 26.10, 26.11");
    expect(prompt).toContain("ADC item changes made on-hit builds stronger.");
    expect(prompt).toContain("Tank items were buffed for front-line durability.");
    expect(prompt).toContain("Meta Snapshot");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- lib/claude.test.ts
```

Expected: FAIL because `buildUserMessage` still expects `Patch[]` content.

- [ ] **Step 3: Update `lib/claude.ts` to use `PatchDigest[]`**

Change imports:

```ts
import type { Game, PatchDigest } from "./types";
```

Replace `buildUserMessage` with:

```ts
export function buildUserMessage(game: Game, digests: PatchDigest[]): string {
  const body = digests
    .map((digest) => `--- Patch ${digest.version} (${digest.date}) ---\n${digest.text}`)
    .join("\n\n");

  return `Game: ${game}
Patch digests missed (${digests.length}): ${digests.map((digest) => digest.version).join(", ")}

You are writing for a player returning after these patches.
Focus on practical differences they will notice now.
Prioritize:
- Meta Snapshot
- Champions / Agents
- Items, Runes, Weapons, Economy, and Systems
- Map, Jungle, Objectives, Modes, and Queue changes
- Quick Re-entry Tips

Merge related changes across patches. Collapse changes that were later reverted or made irrelevant. Skip cosmetics, esports, and minor bug fixes.
Write polished Markdown with ## section headings and concise bullets.

Patch digests:
${body}`;
}
```

Change `streamSummary` signature:

```ts
export async function* streamSummary(game: Game, digests: PatchDigest[]): AsyncGenerator<string> {
```

Keep the Claude call the same except it passes `buildUserMessage(game, digests)`.

- [ ] **Step 4: Update cache fingerprinting in `lib/cache.ts`**

Import `PatchDigest`:

```ts
import type { Game, Patch, PatchDigest } from "./types";
```

Change `summaryFingerprint` params:

```ts
export function summaryFingerprint(params: {
  model: string;
  promptVersion: string;
  digests: PatchDigest[];
}): string {
```

Use digest hashes:

```ts
digests: params.digests.map((digest) => ({
  version: digest.version,
  date: digest.date,
  digest_version: digest.digest_version,
  model: digest.model,
  source_content_hash: digest.source_content_hash,
  text_hash: createHash("sha256").update(digest.text).digest("hex").slice(0, 16),
})),
```

Remove `Patch` from the import if no longer used.

- [ ] **Step 5: Update `lib/cache.test.ts`**

Change the helper from `Patch` to `PatchDigest`:

```ts
import type { PatchDigest } from "./types";

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
```

Update calls to:

```ts
digests: [digest("12.01", "digest a")]
```

and:

```ts
digests: [digest("12.01", "digest b")]
```

- [ ] **Step 6: Update API route to load digests**

In `app/api/summarize/route.ts`, change imports:

```ts
import { loadDigests, loadPatches, resolveDateToRange, resolveDigestsForRange } from "@/lib/patches";
```

After resolving `range`, add:

```ts
let digests;
try {
  digests = resolveDigestsForRange(range, loadDigests(body.game));
} catch {
  return NextResponse.json(
    { error: "patch digests are not ready for this range" },
    { status: 503 }
  );
}
```

Change fingerprint call:

```ts
const fingerprint = summaryFingerprint({
  model: MODEL,
  promptVersion: PROMPT_VERSION,
  digests,
});
```

Change streaming call:

```ts
for await (const chunk of streamSummary(body.game, digests)) {
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
npm test -- lib/claude.test.ts lib/cache.test.ts lib/patches.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/claude.ts lib/claude.test.ts lib/cache.ts lib/cache.test.ts lib/patches.ts lib/patches.test.ts app/api/summarize/route.ts
git commit -m "feat: summarize from local patch digests"
```

---

## Task 8: Render Streamed Markdown Nicely

**Files:**
- Modify: `components/SummaryView.tsx`
- Create: `components/SummaryView.test.tsx`

- [ ] **Step 1: Write failing render tests**

Create `components/SummaryView.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SummaryView } from "./SummaryView";

describe("SummaryView", () => {
  it("renders markdown headings and bullets as HTML while streaming", () => {
    const html = renderToStaticMarkup(
      <SummaryView
        game="lol"
        fromVersion="26.10"
        toVersion="26.11"
        text={"## Meta Snapshot\n- Tanks are stronger."}
        isStreaming={true}
        onReset={vi.fn()}
      />
    );

    expect(html).not.toContain("<pre");
    expect(html).toContain("<h2");
    expect(html).toContain("Meta Snapshot");
    expect(html).toContain("<li");
    expect(html).toContain("Tanks are stronger.");
    expect(html).toContain("▍");
  });

  it("renders markdown headings and bullets as HTML after streaming completes", () => {
    const html = renderToStaticMarkup(
      <SummaryView
        game="lol"
        fromVersion="26.10"
        toVersion="26.11"
        text={"## Meta Snapshot\n- Tanks are stronger.\n\n## Items\n- On-hit builds changed."}
        isStreaming={false}
        onReset={vi.fn()}
      />
    );

    expect(html).toContain("<h2");
    expect(html).toContain("Meta Snapshot");
    expect(html).toContain("<li");
    expect(html).toContain("Tanks are stronger.");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- components/SummaryView.test.tsx
```

Expected: FAIL because `SummaryView` still renders raw streamed text in a `<pre>`.

- [ ] **Step 3: Update `SummaryView.tsx`**

Replace the raw text block with `react-markdown` rendering:

```tsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
```

Inside the component, replace the streaming/completed rendering branch:

```tsx
{isStreaming ? (
  <pre className="whitespace-pre-wrap text-sm leading-6 text-neutral-300">
    {text}
    <span className="inline-block w-2 animate-pulse text-blue-300">▍</span>
  </pre>
) : (
  <div className="space-y-5">
    <ReactMarkdown ...>{text}</ReactMarkdown>
  </div>
)}
```

with:

```tsx
<div className="space-y-5">
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h2: ({ children }) => (
        <h2 className="mt-7 border-b border-neutral-800 pb-2 text-base font-semibold text-neutral-100 first:mt-0">
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="mt-5 text-sm font-semibold text-neutral-200">{children}</h3>
      ),
      p: ({ children }) => (
        <p className="text-sm leading-6 text-neutral-300">{children}</p>
      ),
      ul: ({ children }) => (
        <ul className="space-y-2 pl-4 text-sm leading-6 text-neutral-300">{children}</ul>
      ),
      li: ({ children }) => (
        <li className="list-disc marker:text-blue-400">{children}</li>
      ),
      strong: ({ children }) => (
        <strong className="font-semibold text-neutral-100">{children}</strong>
      ),
    }}
  >
    {text}
  </ReactMarkdown>
  {isStreaming && <span className="inline-block w-2 animate-pulse text-blue-300">▍</span>}
</div>
```

- [ ] **Step 4: Run render test**

Run:

```bash
npm test -- components/SummaryView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/SummaryView.tsx components/SummaryView.test.tsx
git commit -m "feat: render streamed summaries as markdown"
```

---

## Task 9: Wire Digest Generation into Patch Workflow

**Files:**
- Modify: `.github/workflows/fetch-patches.yml`, `CLAUDE.md`

- [ ] **Step 1: Update workflow**

After the `Run fetch-patches` step, commit raw patch data before digest generation:

```yaml
      - name: Commit and push patch data if changed
        run: |
          if [[ -n "$(git status --porcelain data/*/patches.json)" ]]; then
            git config user.name "patchup-bot"
            git config user.email "patchup-bot@users.noreply.github.com"
            git add data/*/patches.json
            git commit -m "chore: update patch data"
            git push
          else
            echo "No patch data changes to commit."
          fi
```

Then add digest generation. This step skips cleanly when `ANTHROPIC_API_KEY` is not configured, and raw patch ingestion remains committed even if Anthropic fails after this point:

```yaml
      - name: Run generate-digests
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          if [[ -z "$ANTHROPIC_API_KEY" ]]; then
            echo "ANTHROPIC_API_KEY is not configured; skipping digest generation."
            exit 0
          fi
          npm run generate-digests

      - name: Commit and push digest data if changed
        run: |
          if [[ -n "$(git status --porcelain data/)" ]]; then
            git config user.name "patchup-bot"
            git config user.email "patchup-bot@users.noreply.github.com"
            git add data/
            git commit -m "chore: update patch digests"
            git push
          else
            echo "No changes to commit."
          fi
```

Do not put raw patch data and AI-generated digest data behind the same commit step; digest failures should not block source-of-truth patch updates.

- [ ] **Step 2: Add required secret note to plan docs**

In this plan's final verification section, note that GitHub Actions requires repository secret `ANTHROPIC_API_KEY`.

- [ ] **Step 3: Document the digest script in `CLAUDE.md`**

Add this section to `CLAUDE.md`. If the file already has a commands section, place it there.

```md
## PatchUp Commands

- `npm run fetch-patches` fetches Riot patch data into `data/<game>/patches.json`.
- `npm run generate-digests` generates missing or stale Haiku patch digests into `data/<game>/digests.json`.
- `npm run generate-digests -- --game valorant` generates only Valorant digests.
- `npm run generate-digests -- --game lol` generates only League of Legends digests.
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/fetch-patches.yml CLAUDE.md docs/superpowers/plans/2026-05-29-patchup-digests-markdown.md
git commit -m "ci: generate patch digests after fetching patches"
```

---

## Task 10: End-to-End Verification

**Files:** none

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: no output and exit code `0`.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: Next.js build completes successfully.

- [ ] **Step 4: Validate local digest coverage**

Run:

```bash
node -e "const fs=require('fs'); for (const g of ['valorant','lol']) { const p=JSON.parse(fs.readFileSync('data/'+g+'/patches.json','utf8')); const d=JSON.parse(fs.readFileSync('data/'+g+'/digests.json','utf8')); const byVersion=new Map(d.map(x=>[x.version,x])); const missing=p.filter(x=>!byVersion.has(x.version)); const stale=p.filter(x=>byVersion.get(x.version)?.source_content_hash!==x.content_hash); console.log(g, 'missing', missing.length, 'stale', stale.length); if (missing.length || stale.length) process.exitCode=1; }"
```

Expected:

```text
valorant missing 0 stale 0
lol missing 0 stale 0
```

- [ ] **Step 5: Manual browser smoke test**

Run:

```bash
npm run dev
```

Open `http://localhost:3000` and verify:
- Pick Valorant and an old date. Preview shows a patch range.
- Submit. Summary streams and renders headings/bullets as styled Markdown.
- Pick League of Legends and an old date. Summary still works without a giant raw-patch prompt.
- Pick a future date. Up-to-date state still works.
- Temporarily set `SUMMARY_GENERATION_RATE_LIMIT=0` before starting dev server. Submit a non-cached range and confirm the UI displays the rate-limit error state.

- [ ] **Step 6: GitHub Actions setup check**

Confirm repository secret exists:

```text
ANTHROPIC_API_KEY
```

Expected: secret is configured before relying on scheduled digest generation. If it is missing, the workflow still commits raw patch data and skips digest generation.

---

## Self-Review Notes

- Spec coverage: plan covers Haiku local digests, Sonnet final synthesis from digest text, final cache invalidation through digest hashes, and Markdown UI rendering.
- Cost control: Haiku calls happen during ingestion and only for missing/stale patch digests.
- Prompt size control: `POST /api/summarize` uses `PatchDigest[]`, not full `Patch[]`.
- No raw Markdown dump: `SummaryView` renders streamed and completed text through `react-markdown`.
- Operational requirement: GitHub Actions needs `ANTHROPIC_API_KEY` to generate digests after fetching patches, but raw patch ingestion is committed independently.
