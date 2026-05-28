import type { Patch } from "@/lib/types";

export interface PatchListEntry {
  version: string;
  url: string;
  date: string;
}

export interface PatchParser {
  parser_version: string;
  listPatches: (indexHtml: string) => PatchListEntry[];
  parsePatch: (entry: PatchListEntry, patchHtml: string) => Patch;
}
