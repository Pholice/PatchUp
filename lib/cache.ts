import { createHash } from "node:crypto";
import { list, put } from "@vercel/blob";
import type { Game, Patch } from "./types";

export const SUMMARY_VERSION = "v1";

export function summaryFingerprint(params: {
  model: string;
  promptVersion: string;
  patches: Patch[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        summaryVersion: SUMMARY_VERSION,
        model: params.model,
        promptVersion: params.promptVersion,
        patches: params.patches.map((p) => ({
          version: p.version,
          date: p.date,
          parser_version: p.parser_version,
          content_hash: p.content_hash,
        })),
      })
    )
    .digest("hex")
    .slice(0, 16);
}

export function cacheKey(
  game: Game,
  fromVersion: string,
  toVersion: string,
  fingerprint: string
): string {
  return `summaries/${game}/${fromVersion}_${toVersion}/${fingerprint}.txt`;
}

export async function readSummary(key: string): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    if (!blobs.length || blobs[0].pathname !== key) return null;
    const res = await fetch(blobs[0].url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function writeSummary(key: string, text: string): Promise<void> {
  await put(key, text, {
    access: "public",
    contentType: "text/plain; charset=utf-8",
    addRandomSuffix: false,
  });
}
