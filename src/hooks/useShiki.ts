import { useEffect, useRef, useState, useCallback } from "react";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import ayuLight from "shiki/themes/ayu-light.mjs";
import markdown from "shiki/langs/markdown.mjs";

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [ayuLight],
      langs: [markdown],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
  }
  return highlighterPromise;
}

export function useShiki() {
  const [ready, setReady] = useState(false);
  const highlighterRef = useRef<HighlighterCore | null>(null);

  useEffect(() => {
    getHighlighter().then((h) => {
      highlighterRef.current = h;
      setReady(true);
    });
  }, []);

  const highlight = useCallback(
    (code: string): string => {
      if (!highlighterRef.current) return escapeHtml(code);
      try {
        const { tokens } = highlighterRef.current.codeToTokens(code, {
          lang: "markdown",
          theme: "ayu-light",
        });
        const html = tokens
          .map((line) =>
            line.length === 0
              ? ""
              : line
                  .map((token) =>
                    token.color
                      ? `<span style="color:${token.color}">${escapeHtml(token.content)}</span>`
                      : escapeHtml(token.content),
                  )
                  .join(""),
          )
          .join("\n");
        return html + "\n";
      } catch {
        return escapeHtml(code);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready],
  );

  return { highlight, ready };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
