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
