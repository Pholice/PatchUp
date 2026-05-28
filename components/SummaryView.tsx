"use client";

interface Props {
  game: string;
  fromVersion: string;
  toVersion: string;
  text: string;
  isStreaming: boolean;
  onReset: () => void;
}

export function SummaryView({ game, fromVersion, toVersion, text, isStreaming, onReset }: Props) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-emerald-400">{game.toUpperCase()}</div>
          <div className="text-xs text-neutral-500">
            Patches {fromVersion} → {toVersion}
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-neutral-400 hover:text-neutral-200"
        >
          ← new search
        </button>
      </div>

      <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
        {text}
        {isStreaming && <span className="inline-block w-2 animate-pulse">▍</span>}
      </div>

      <div className="mt-8 rounded-md border-l-2 border-blue-700 bg-neutral-900 p-3">
        <div className="text-xs font-semibold text-blue-300">v2 · Community Sentiment</div>
        <div className="text-xs text-neutral-500">Reddit & community reaction data — coming soon</div>
      </div>
    </div>
  );
}
