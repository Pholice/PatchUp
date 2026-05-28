# PatchUp — Design Spec
**Date:** 2026-05-27
**Status:** Approved

## Overview

PatchUp is an open source web app that takes the last date a user played a game, identifies all patches released since then, and uses Claude AI to produce a single unified summary of what changed. Rather than building a universal parser, each supported game has its own dedicated scraper and parser.

**v1 scope:** Valorant + League of Legends, manual date entry, no auth, no accounts.

---

## Architecture

Three distinct layers:

### 1. Data Layer — Static patch JSON (committed to repo)

Patch notes are pre-fetched and stored as structured JSON files in the repo:

```
data/
  valorant/patches.json
  lol/patches.json
```

Each patch entry contains:
```json
{
  "version": "10.08",
  "date": "2025-04-15",
  "locale": "en-us",
  "url": "https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-10-08/",
  "fetched_at": "2026-05-27T14:30:00Z",
  "parser_version": "valorant-v1",
  "content_hash": "a1b2c3d4e5f60789",
  "sections": [
    {
      "title": "Agent Updates",
      "items": ["Jett: Updraft charges reduced from 2 to 1", "..."]
    }
  ],
  "raw_text": "..."
}
```

### 2. Ingestion Layer — GitHub Actions cron

A scheduled GitHub Actions workflow runs weekly (Riot patches on a ~2-week Tuesday cadence) plus supports manual dispatch for off-cycle patches.

**Workflow:** `.github/workflows/fetch-patches.yml`
- Runs `scripts/fetch-patches.ts`
- Per-game parsers in `scripts/parsers/valorant.ts` and `scripts/parsers/lol.ts`
- Compares live Riot patch list against existing JSON; appends new entries and refreshes recent known entries when parsed content changes
- Commits and pushes updated JSON automatically
- GitHub notifies repo owner on workflow failure by default

Both Valorant and LoL share the same Riot site structure (playvalorant.com / leagueoflegends.com), so one scraper pattern covers both. Cheerio (jQuery-style HTML parsing) is used for static HTML parsing — no headless browser needed for Riot's pages.

### 3. API + UI Layer — Next.js on Vercel

**API route:** `POST /api/summarize`

1. Receives `{ game, lastPlayedDate }`
2. Resolves date to a patch version range (e.g., `10.04 → 10.10`) by scanning the JSON
3. Checks Vercel Blob for a cached summary keyed to `{game}:{fromVersion}:{toVersion}:{fingerprint}`
4. **Cache hit:** return cached summary immediately
5. **Cache miss:** collect all patch notes in range, call Claude API, stream response back as text, store the completed text result in Vercel Blob

**Cache key:** `{game}:{fromVersion}:{toVersion}:{fingerprint}` — date-independent, so two users who last played around the same time share the same cached summary. `fingerprint` is a short hash of the summary version, model id, prompt version, and each included patch's `{version, date, parser_version, content_hash}`. When Riot edits a patch, parser output changes, the prompt changes, or the model changes, the old Blob object naturally becomes unreachable and a fresh summary is generated.

**Summary format:** user-facing summaries are streamed and rendered as text only. Cached summaries are stored as the completed UTF-8 text payload, not as a per-token transcript or verbose JSON envelope.

**UI:** Single-page React app (`app/page.tsx`). No navigation, no accounts.

---

## File Structure

```
patchup/
  data/
    valorant/patches.json       ← committed patch data
    lol/patches.json
  scripts/
    fetch-patches.ts            ← entry point, run by Actions
    parsers/
      valorant.ts               ← Riot patch page parser
      lol.ts                    ← Riot patch page parser
  app/
    api/
      summarize/
        route.ts                ← core API route
    page.tsx                    ← UI
    layout.tsx
  .github/
    workflows/
      fetch-patches.yml         ← cron + manual dispatch
  .gitignore                    ← includes .superpowers/
```

---

## UI Flow

### Screen 1 — Input
- Game selector: Valorant | League of Legends (toggle)
- Date input: freeform date picker
- As the user selects a date, the UI resolves it to a patch range inline: "Covers patches 10.04 → 10.10 · 6 patches"
- Submit button: "Catch Me Up →"

### Screen 2 — Loading
- Shows patch count being processed
- Progress indicator while Claude streams

### Screen 3 — Summary
- Header: game name + patch range
- Summary grouped by **category** (Agent Changes, Weapon Tuning, Map Updates, etc.) — one unified view across all missed patches, not a per-patch changelog
- Claude response is streamed so content appears progressively
- "← new search" link to return to input
- v2 placeholder: "Community Sentiment — coming soon" section at the bottom

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Date before earliest tracked patch | Clamp to oldest known patch; note in UI: "We only have patches back to X.XX" |
| Date after latest patch | Skip Claude call; show "You're up to date — no patches since you last played" |
| Scraper failure / stale data | App continues working with existing data; show "last updated X days ago" derived from the latest patch date in the JSON; Actions failure emails repo owner |

---

## Claude Integration

- **Model:** claude-sonnet-4-20250514 (balance of quality and cost for a side project)
- **Prompt:** System prompt instructs Claude to summarize as a returning player briefing — group by category, focus on what's meaningfully different, skip minor bug fixes
- **Streaming:** Response streamed to UI as text via Vercel's streaming support; Blob cache is written only after the full stream completes (no partial caching)
- **Caching:** Summaries stored in Vercel Blob as completed text payloads; never re-generated for the same patch range and fingerprint
- **Invalidation:** A summary fingerprint is derived from `SUMMARY_VERSION`, model id, prompt version, parser versions, and patch `content_hash` values. Changing any of those inputs generates a different cache key automatically.

---

## v2 — Sentiment & Prediction Layer (future)

After the core summarization is stable, add a sentiment layer:

1. **Data source:** Reddit API — r/VALORANT and r/leagueoflegends patch megathreads for the relevant versions
2. **Ingestion:** Could be fetched on-demand (Reddit API is free) or pre-fetched alongside patch notes
3. **Claude prompt extension:** Pass community reaction excerpts alongside patch notes; instruct Claude to add a "Community Reception" section and a "State of the Game" assessment
4. **Prediction angle:** Based on community sentiment and patch direction, synthesize how the game has shifted from the user's last session — tone, meta, fun factor

This slots in between the existing cache check and Claude call in `route.ts` — no structural changes to the rest of the app.

---

## Out of Scope (v1)

- Steam OAuth or any automatic last-played detection
- User accounts, saved history, notifications
- Games beyond Valorant and LoL
- Monetization, paywalls, or rate limiting
- Mobile app or CLI
