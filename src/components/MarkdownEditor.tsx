import { useRef, useEffect, useCallback } from "react";
import { useShiki } from "../hooks/useShiki";
import styles from "./MarkdownEditor.module.css";

interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInput: () => void;
  initialContent: string;
}

export function MarkdownEditor({
  textareaRef,
  onInput,
  initialContent,
}: Props) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const { highlight, ready } = useShiki();

  const syncHighlight = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = textareaRef.current;
      const pre = highlightRef.current;
      if (!el || !pre) return;
      const html = highlight(el.value);
      pre.innerHTML = html;
    });
  }, [highlight, textareaRef]);

  // Re-highlight when shiki becomes ready or textarea content changes externally
  useEffect(() => {
    if (ready) syncHighlight();
  }, [ready, syncHighlight]);

  // Observe textarea value changes (covers SSE updates, initial load, etc.)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const observer = new MutationObserver(syncHighlight);
    observer.observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    // Also poll for programmatic .value changes (MutationObserver won't catch those)
    const interval = setInterval(() => {
      syncHighlight();
    }, 200);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [syncHighlight, textareaRef]);

  const handleInput = useCallback(() => {
    syncHighlight();
    onInput();
  }, [syncHighlight, onInput]);

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div
          ref={highlightRef}
          className={styles.highlight}
          aria-hidden="true"
        />
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="Start writing..."
          defaultValue={initialContent}
          onInput={handleInput}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
