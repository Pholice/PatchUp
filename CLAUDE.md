# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run test         # Run all tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run fetch-patches  # Scrape and update patch data from game sites
npm run generate-digests  # Generate missing/stale Haiku patch digests into data/<game>/digests.json
npm run generate-digests -- --game valorant  # Generate only Valorant digests
npm run generate-digests -- --game lol  # Generate only League of Legends digests
```

To run a single test file:
```bash
npx vitest run lib/cache.test.ts
```

## Architecture

PatchUp is a Next.js 15 app that summarizes game patch notes for returning players using Claude (Anthropic AI). The core flow:

1. **Patch data** lives in `data/{game}/patches.json` — static JSON bundled at build time, scraped by `scripts/fetch-patches.ts` via a GitHub Actions cron job.
2. **API route** (`app/api/summarize/route.ts`) handles two requests:
   - `GET` — returns a patch range preview (count, version range, date bounds) without calling AI
   - `POST` — streams a Claude-generated summary; checks Vercel Blob cache first, rate-limits by IP before calling Claude
3. **Streaming** flows from `lib/claude.ts` → `streamSummary()` → route handler → client via `ReadableStream`. The client (`app/page.tsx`) appends streamed chunks into `view.text` and re-renders on each chunk.
4. **Caching** (`lib/cache.ts`) stores generated summaries in Vercel Blob. Cache keys are fingerprinted by model ID, prompt version, and patch content hashes — so any prompt/model change auto-invalidates old summaries.

### Key modules

- `lib/patches.ts` — loads JSON patch data and resolves a "last played" date to a version range
- `lib/claude.ts` — system prompt, user message builder, and `streamSummary()` generator; `MODEL` and `PROMPT_VERSION` constants control cache invalidation
- `lib/rate-limit.ts` — in-memory sliding window limiter; `SUMMARY_GENERATION_RATE_LIMIT` env var controls the threshold (default 10/hour)
- `scripts/parsers/` — per-game HTML scrapers (`valorant.ts`, `lol.ts`) with corresponding `*.test.ts` files that use HTML fixtures from `__fixtures__/`

### Supported games

`lib/types.ts` defines `Game = "valorant" | "lol"`. Adding a new game requires: a parser in `scripts/parsers/`, a `GameConfig` entry in `scripts/fetch-patches.ts`, a data file in `data/{game}/patches.json`, and an entry in `lib/patches.ts`'s `DATASETS`.

## Environment variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required for AI summarization |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage for caching summaries |
| `SUMMARY_GENERATION_RATE_LIMIT` | Max new summaries per IP per hour (default: 10) |
