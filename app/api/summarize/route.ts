import { NextResponse } from "next/server";
import { loadPatches, resolveDateToRange } from "@/lib/patches";
import { cacheKey, readSummary, summaryFingerprint, writeSummary } from "@/lib/cache";
import { MODEL, PROMPT_VERSION, streamSummary } from "@/lib/claude";
import type { Game } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  game: Game;
  lastPlayedDate: string;
}

function isValidGame(g: unknown): g is Game {
  return g === "valorant" || g === "lol";
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  if (!isValidGame(body.game)) {
    return NextResponse.json({ error: "invalid game" }, { status: 400 });
  }
  const date = new Date(body.lastPlayedDate);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const patches = loadPatches(body.game);
  const range = resolveDateToRange(patches, date);

  if (range.patches.length === 0) {
    return NextResponse.json({ status: "up-to-date", patchCount: 0 });
  }

  const fingerprint = summaryFingerprint({
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    patches: range.patches,
  });
  const key = cacheKey(body.game, range.fromVersion, range.toVersion, fingerprint);
  const cached = await readSummary(key);

  if (cached) {
    return new Response(cached, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Cache": "HIT" },
    });
  }

  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamSummary(body.game, range.patches)) {
          buffer += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
        await writeSummary(key, buffer);
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Cache": "MISS" },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const game = url.searchParams.get("game");
  const dateParam = url.searchParams.get("date");

  if (!isValidGame(game)) {
    return NextResponse.json({ error: "invalid game" }, { status: 400 });
  }
  if (!dateParam) {
    return NextResponse.json({ error: "missing date" }, { status: 400 });
  }
  const date = new Date(dateParam);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const patches = loadPatches(game);
  const range = resolveDateToRange(patches, date);

  const latestPatchDate = patches.length > 0 ? patches[patches.length - 1].date : null;
  const earliestPatchDate = patches.length > 0 ? patches[0].date : null;
  const earliestVersion = patches.length > 0 ? patches[0].version : null;

  return NextResponse.json({
    fromVersion: range.fromVersion,
    toVersion: range.toVersion,
    patchCount: range.patches.length,
    latestPatchDate,
    earliestPatchDate,
    earliestVersion,
  });
}
