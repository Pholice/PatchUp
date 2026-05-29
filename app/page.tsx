"use client";

import { useEffect, useState } from "react";
import { GameToggle } from "@/components/GameToggle";
import { DateField } from "@/components/DateField";
import { SummaryView } from "@/components/SummaryView";
import { EmptyState } from "@/components/EmptyState";
import type { Game } from "@/lib/types";

interface Preview {
  fromVersion: string;
  toVersion: string;
  patchCount: number;
  latestPatchDate: string | null;
  earliestPatchDate: string | null;
  earliestVersion: string | null;
}

type View =
  | { mode: "input" }
  | { mode: "summary"; game: Game; fromVersion: string; toVersion: string; text: string; streaming: boolean; coverageNote: string | null }
  | { mode: "up-to-date" }
  | { mode: "error"; message: string };

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export default function Page() {
  const [game, setGame] = useState<Game>("valorant");
  const [date, setDate] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [view, setView] = useState<View>({ mode: "input" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!date) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/summarize?game=${game}&date=${date}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Preview failed");
        return r.json();
      })
      .then((p) => setPreview(p))
      .catch(() => {});
    return () => controller.abort();
  }, [game, date]);

  async function submit() {
    if (!date || !preview) return;
    setSubmitting(true);

    try {
      if (preview.patchCount === 0) {
        setView({ mode: "up-to-date" });
        return;
      }

      const coverageNote =
        preview.earliestPatchDate && date < preview.earliestPatchDate
          ? `We only have patches back to ${preview.earliestVersion}. Summary starts from there.`
          : null;

      setView({
        mode: "summary",
        game,
        fromVersion: preview.fromVersion,
        toVersion: preview.toVersion,
        text: "",
        streaming: true,
        coverageNote,
      });

      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, lastPlayedDate: date }),
      });

      if (!res.ok) {
        let message = "Could not generate the summary. Try again in a bit.";
        try {
          const error = (await res.json()) as { error?: string; retryAfterSeconds?: number };
          if (error.error === "rate limit exceeded" && error.retryAfterSeconds) {
            message = `Too many fresh summaries. Try again in ${error.retryAfterSeconds} seconds.`;
          } else if (error.error) {
            message = error.error;
          }
        } catch {
          message = res.statusText || message;
        }
        setView({ mode: "error", message });
        return;
      }

      if (!res.body) {
        setView({ mode: "error", message: "The summary response was empty." });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setView({
          mode: "summary",
          game,
          fromVersion: preview.fromVersion,
          toVersion: preview.toVersion,
          text,
          streaming: true,
          coverageNote,
        });
      }

      setView({
        mode: "summary",
        game,
        fromVersion: preview.fromVersion,
        toVersion: preview.toVersion,
        text,
        streaming: false,
        coverageNote,
      });
    } catch {
      setView({ mode: "error", message: "The summary stream failed. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setView({ mode: "input" });
    setDate("");
    setPreview(null);
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">PatchUp</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Catch up on what changed while you were away
        </p>
      </div>

      {view.mode === "input" && (
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs uppercase text-neutral-500">Game</div>
            <GameToggle value={game} onChange={setGame} />
          </div>

          <div>
            <div className="mb-2 text-xs uppercase text-neutral-500">When did you last play?</div>
            <DateField value={date} onChange={setDate} />
          </div>

          {preview && date && (
            <div className="space-y-1 text-center text-xs text-neutral-500">
              <div>
                {preview.patchCount > 0
                  ? `Covers patches ${preview.fromVersion} → ${preview.toVersion} · ${preview.patchCount} patches`
                  : "You're already up to date"}
              </div>
              {preview.earliestPatchDate && date < preview.earliestPatchDate && (
                <div className="text-amber-400">
                  Note: we only have patches back to {preview.earliestVersion}.
                </div>
              )}
            </div>
          )}

          {preview?.latestPatchDate && (
            <div className="text-center text-[10px] text-neutral-600">
              Patch data last updated {daysSince(preview.latestPatchDate)} day(s) ago
            </div>
          )}

          <button
            type="button"
            disabled={!date || submitting}
            onClick={submit}
            className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Catching you up..." : "Catch Me Up →"}
          </button>
        </div>
      )}

      {view.mode === "summary" && (
        <>
          {view.coverageNote && (
            <div className="mb-3 rounded-md border border-amber-700/40 bg-amber-950/40 p-2 text-center text-xs text-amber-300">
              {view.coverageNote}
            </div>
          )}
          <SummaryView
            game={view.game}
            fromVersion={view.fromVersion}
            toVersion={view.toVersion}
            text={view.text}
            isStreaming={view.streaming}
            onReset={reset}
          />
        </>
      )}

      {view.mode === "up-to-date" && <EmptyState onReset={reset} />}

      {view.mode === "error" && (
        <div className="rounded-md border border-red-800 bg-red-950/40 p-6 text-center">
          <div className="text-sm font-semibold text-red-300">Summary failed</div>
          <div className="mt-1 text-xs text-red-100/80">{view.message}</div>
          <button
            type="button"
            onClick={reset}
            className="mt-4 text-xs text-neutral-400 hover:text-neutral-200"
          >
            ← new search
          </button>
        </div>
      )}
    </main>
  );
}
