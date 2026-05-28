import type { Game, Patch, PatchRange } from "./types";
import valorantData from "@/data/valorant/patches.json";
import lolData from "@/data/lol/patches.json";

const DATASETS: Record<Game, Patch[]> = {
  valorant: valorantData as Patch[],
  lol: lolData as Patch[],
};

export function loadPatches(game: Game): Patch[] {
  return [...DATASETS[game]].sort((a, b) => a.date.localeCompare(b.date));
}

export function resolveDateToRange(patches: Patch[], lastPlayed: Date): Omit<PatchRange, "game"> {
  const sorted = [...patches].sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = lastPlayed.toISOString().slice(0, 10);
  const missed = sorted.filter((p) => p.date > cutoff);

  if (missed.length === 0) {
    return { fromVersion: "", toVersion: "", patches: [] };
  }

  return {
    fromVersion: missed[0].version,
    toVersion: missed[missed.length - 1].version,
    patches: missed,
  };
}
