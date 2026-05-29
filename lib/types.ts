export type Game = "valorant" | "lol";

export interface PatchSection {
  title: string;
  items: string[];
}

export interface Patch {
  version: string;
  date: string;
  locale: string;
  url: string;
  fetched_at: string;
  parser_version: string;
  content_hash: string;
  sections: PatchSection[];
  raw_text: string;
}

export interface PatchDigest {
  game: Game;
  version: string;
  date: string;
  source_content_hash: string;
  digest_version: string;
  model: string;
  generated_at: string;
  text: string;
}

export interface PatchRange {
  game: Game;
  fromVersion: string;
  toVersion: string;
  patches: Patch[];
}
