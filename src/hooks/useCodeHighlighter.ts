import { useEffect, useRef, useState, useCallback } from "react";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import ayuLight from "shiki/themes/ayu-light.mjs";

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [ayuLight],
      langs: [
        import("shiki/langs/javascript.mjs"),
        import("shiki/langs/typescript.mjs"),
        import("shiki/langs/jsx.mjs"),
        import("shiki/langs/tsx.mjs"),
        import("shiki/langs/python.mjs"),
        import("shiki/langs/css.mjs"),
        import("shiki/langs/html.mjs"),
        import("shiki/langs/json.mjs"),
        import("shiki/langs/bash.mjs"),
        import("shiki/langs/markdown.mjs"),
        import("shiki/langs/yaml.mjs"),
        import("shiki/langs/sql.mjs"),
        import("shiki/langs/rust.mjs"),
        import("shiki/langs/go.mjs"),
      ],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
  }
  return highlighterPromise;
}

export function useCodeHighlighter() {
  const [ready, setReady] = useState(false);
  const highlighterRef = useRef<HighlighterCore | null>(null);

  useEffect(() => {
    getHighlighter().then((h) => {
      highlighterRef.current = h;
      setReady(true);
    });
  }, []);

  const highlight = useCallback(
    (code: string, lang: string): string => {
      if (!highlighterRef.current) return escapeHtml(code);
      try {
        const loadedLangs = highlighterRef.current.getLoadedLanguages();
        if (!loadedLangs.includes(lang)) return escapeHtml(code);
        return highlighterRef.current.codeToHtml(code, {
          lang,
          theme: "ayu-light",
        });
      } catch {
        return escapeHtml(code);
      }
    },
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
