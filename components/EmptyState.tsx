"use client";

interface Props {
  onReset: () => void;
}

export function EmptyState({ onReset }: Props) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 p-6 text-center">
      <div className="text-sm font-semibold text-emerald-400">You're up to date</div>
      <div className="mt-1 text-xs text-neutral-500">
        No patches have been released since you last played.
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 text-xs text-neutral-400 hover:text-neutral-200"
      >
        ← new search
      </button>
    </div>
  );
}
