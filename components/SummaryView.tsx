"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  game: string;
  fromVersion: string;
  toVersion: string;
  text: string;
  isStreaming: boolean;
  onReset: () => void;
}

export function SummaryView({ game, fromVersion, toVersion, text, isStreaming, onReset }: Props) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-emerald-400">{game.toUpperCase()}</div>
          <div className="text-xs text-neutral-500">
            Patches {fromVersion} → {toVersion}
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-neutral-400 hover:text-neutral-200"
        >
          ← new search
        </button>
      </div>

      <div className="space-y-5">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-bold leading-7 text-neutral-50">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-7 border-b border-neutral-800 pb-2 text-base font-semibold text-neutral-100 first:mt-0">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-5 text-sm font-semibold text-neutral-200">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="text-sm leading-6 text-neutral-300">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="my-3 space-y-2 pl-5 text-sm leading-6 text-neutral-300">{children}</ul>
            ),
            li: ({ children }) => (
              <li className="list-disc marker:text-blue-400">{children}</li>
            ),
            hr: () => <hr className="my-6 border-neutral-800" />,
            strong: ({ children }) => (
              <strong className="font-semibold text-neutral-100">{children}</strong>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
        {isStreaming && <span className="inline-block w-2 animate-pulse text-blue-300">▍</span>}
      </div>

      <div className="mt-8 rounded-md border-l-2 border-blue-700 bg-neutral-900 p-3">
        <div className="text-xs font-semibold text-blue-300">v2 · Community Sentiment</div>
        <div className="text-xs text-neutral-500">Reddit & community reaction data — coming soon</div>
      </div>
    </div>
  );
}
