import Anthropic from "@anthropic-ai/sdk";
import type { Game, PatchDigest } from "./types";

export const MODEL = "claude-sonnet-4-6";
export const PROMPT_VERSION = "returning-player-v3";

const SYSTEM_PROMPT = `You are PatchUp, a returning-player briefing assistant.
You receive compact digests of game patches the player missed.
Write a single unified briefing, NOT a per-patch changelog.
Merge related changes across patches. Collapse changes that were later reverted or made irrelevant.
Skip cosmetics, esports, and minor bug fixes.
Write polished Markdown with ## section headings and concise bullets.`;

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

export async function* streamSummary(game: Game, digests: PatchDigest[]): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(game, digests) }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
