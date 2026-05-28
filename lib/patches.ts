import type { Game, Patch, PatchRange } from "./types";
import valorantData from "@/data/valorant/patches.json";
import lolData from "@/data/lol/patches.json";

const DATASETS: Record<Game, Patch[]> = {
  valorant: valorantData as Patch[],
  lol: lolData as Patch[],
};

export function loadPatches(game: Game): Patch[] {
  return [...DATASETS[game]].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function resolveDateToRange(patches: Patch[], lastPlayed: Date): Omit<PatchRange, "game"> {
  const sorted = [...patches].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const cutoff = [
    lastPlayed.getFullYear(),
    String(lastPlayed.getMonth() + 1).padStart(2, "0"),
    String(lastPlayed.getDate()).padStart(2, "0"),
  ].join("-");
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
