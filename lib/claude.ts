import Anthropic from "@anthropic-ai/sdk";
import type { Patch } from "./types";

export const MODEL = "claude-sonnet-4-6";
export const PROMPT_VERSION = "returning-player-v1";

const SYSTEM_PROMPT = `You are PatchUp, a returning-player briefing assistant.
You receive a list of patch notes the player missed since their last session.
Write a single unified summary, NOT a per-patch changelog.
Group changes by category (e.g., "Agent Changes", "Weapon Tuning", "Map Updates").
Focus on what meaningfully affects gameplay; skip minor bug fixes and quality-of-life tweaks.
Format each category as a markdown heading (## Category) followed by short bullet points.
Be concise; the player wants to be caught up quickly, not read every line.`;

function buildUserMessage(game: string, patches: Patch[]): string {
  const intro = `Game: ${game}
Patches missed (${patches.length}): ${patches.map((p) => p.version).join(", ")}

Patch notes:
`;
  const body = patches
    .map((p) => {
      const sections = p.sections
        .map((s) => `### ${s.title}\n${s.items.map((i) => `- ${i}`).join("\n")}`)
        .join("\n\n");
      return `--- Patch ${p.version} (${p.date}) ---\n${sections}`;
    })
    .join("\n\n");
  return intro + body;
}

export async function* streamSummary(game: string, patches: Patch[]): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(game, patches) }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
