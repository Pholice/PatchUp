import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SummaryView } from "./SummaryView";

describe("SummaryView", () => {
  it("renders markdown headings and bullets as HTML while streaming", () => {
    const html = renderToStaticMarkup(
      <SummaryView
        game="lol"
        fromVersion="26.10"
        toVersion="26.11"
        text={"## Meta Snapshot\n- Tanks are stronger."}
        isStreaming={true}
        onReset={vi.fn()}
      />
    );

    expect(html).not.toContain("<pre");
    expect(html).toContain("<h2");
    expect(html).toContain("Meta Snapshot");
    expect(html).toContain("<li");
    expect(html).toContain("Tanks are stronger.");
    expect(html).toContain("▍");
  });

  it("renders top-level headings, separators, and nested bullets", () => {
    const html = renderToStaticMarkup(
      <SummaryView
        game="valorant"
        fromVersion="10.09"
        toVersion="12.10"
        text={
          "# VALORANT Catch-Up Briefing (Patches 10.09 → 12.10)\n\n---\n\n## Agent Changes\n\n- **Harbor** changed.\n  - **Initiators:** Breach, Fade\n  - **Duelists:** Neon, Reyna"
        }
        isStreaming={false}
        onReset={vi.fn()}
      />
    );

    expect(html).toContain("<h1");
    expect(html).toContain("VALORANT Catch-Up Briefing");
    expect(html).toContain("<hr");
    expect(html).toContain("text-xl");
    expect(html).toContain("my-6 border-neutral-800");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("Initiators:");
  });

  it("renders markdown headings and bullets as HTML after streaming completes", () => {
    const html = renderToStaticMarkup(
      <SummaryView
        game="lol"
        fromVersion="26.10"
        toVersion="26.11"
        text={"## Meta Snapshot\n- Tanks are stronger.\n\n## Items\n- On-hit builds changed."}
        isStreaming={false}
        onReset={vi.fn()}
      />
    );

    expect(html).toContain("<h2");
    expect(html).toContain("Meta Snapshot");
    expect(html).toContain("<li");
    expect(html).toContain("Tanks are stronger.");
  });
});
