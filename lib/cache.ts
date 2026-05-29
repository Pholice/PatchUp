import { createHash } from "node:crypto";
import { head, put } from "@vercel/blob";
import type { Game, PatchDigest } from "./types";

export const SUMMARY_VERSION = "v1";

export function summaryFingerprint(params: {
  model: string;
  promptVersion: string;
  digests: PatchDigest[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        summaryVersion: SUMMARY_VERSION,
        model: params.model,
        promptVersion: params.promptVersion,
        digests: params.digests.map((digest) => ({
          version: digest.version,
          date: digest.date,
          digest_version: digest.digest_version,
          model: digest.model,
          source_content_hash: digest.source_content_hash,
          text_hash: createHash("sha256").update(digest.text).digest("hex").slice(0, 16),
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
    const info = await head(key);
    const res = await fetch(info.url);
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
