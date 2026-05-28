"use client";

import type { Game } from "@/lib/types";

interface Props {
  value: Game;
  onChange: (g: Game) => void;
}

export function GameToggle({ value, onChange }: Props) {
  const games: { id: Game; label: string }[] = [
    { id: "valorant", label: "VALORANT" },
    { id: "lol", label: "League of Legends" },
  ];

  return (
    <div className="flex gap-2">
      {games.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onChange(g.id)}
          className={
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition " +
            (value === g.id
              ? "bg-blue-600 text-white"
              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700")
          }
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
