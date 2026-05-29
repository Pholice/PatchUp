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
    .map((block) => (block as Anthropic.TextBlock).text)
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
