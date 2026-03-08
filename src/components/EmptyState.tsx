import { useState, useRef, useEffect, useCallback } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react";
import { DocEntry, DocMode } from "../hooks/useDocs";
import { relativeTime } from "../utils/time";
import { FileSelector } from "./FileSelector";
import styles from "./EmptyState.module.css";

const MODE_CONFIG: Array<{
  value: DocMode;
  label: string;
  tooltip: string;
}> = [
  {
    value: "planning",
    label: "Planning",
    tooltip: "Create implementation plans, specs, and architecture decisions",
  },
  {
    value: "research",
    label: "Research",
    tooltip:
      "Investigate topics, synthesize findings, and write research reports",
  },
  {
    value: "general",
    label: "General",
    tooltip: "Freeform document editing for any use case",
  },
];

function detectAtQuery(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  const query = before.slice(atIdx + 1);
  if (/[\s\n]/.test(query)) return null;
  return query;
}

interface Props {
  onSubmit: (message: string) => void;
  recentDocs: DocEntry[];
  onNavigateToDoc: (docId: string) => void;
  mode: DocMode;
  onModeChange: (mode: DocMode) => void;
  currentDocId?: string | null;
}

export function EmptyState({
  onSubmit,
  recentDocs,
  onNavigateToDoc,
  mode,
  onModeChange,
  currentDocId,
}: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef(0);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [selectorFiles, setSelectorFiles] = useState<string[]>([]);
  const [selectorIndex, setSelectorIndex] = useState(0);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const border = ta.offsetHeight - ta.clientHeight;
    ta.style.height = ta.scrollHeight + border + "px";
  }, [input]);

  function handleSubmit() {
    const prompt = input.trim();
    if (!prompt) return;
    setInput("");
    setAtQuery(null);
    onSubmit(prompt);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);
    const pos = e.target.selectionStart ?? val.length;
    cursorPosRef.current = pos;
    setAtQuery(detectAtQuery(val, pos));
  }

  const handleCursorMove = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    cursorPosRef.current = pos;
    setAtQuery(detectAtQuery(input, pos));
  }, [input]);

  function handleFileSelect(file: string) {
    const pos = cursorPosRef.current;
    const before = input.slice(0, pos);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) return;
    const after = input.slice(pos);
    const newInput = before.slice(0, atIdx) + "@" + file + " " + after;
    setInput(newInput);
    setAtQuery(null);
    const newCursor = atIdx + 1 + file.length + 1;
    cursorPosRef.current = newCursor;
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(newCursor, newCursor);
      textareaRef.current?.focus();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (atQuery !== null && selectorFiles.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectorIndex((i) => Math.min(i + 1, selectorFiles.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectorIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleFileSelect(selectorFiles[selectorIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAtQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.modeSelector}>
          {MODE_CONFIG.map((m) => (
            <button
              key={m.value}
              className={`${styles.modeButton} ${mode === m.value ? styles.modeButtonActive : ""}`}
              onClick={() => onModeChange(m.value)}
              title={m.tooltip}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className={styles.inputWrapper}>
          {atQuery !== null && (
            <FileSelector
              query={atQuery}
              activeIndex={selectorIndex}
              onActiveIndexChange={setSelectorIndex}
              onFilesChange={setSelectorFiles}
              onSelect={handleFileSelect}
              files={selectorFiles}
              currentDocId={currentDocId}
            />
          )}
          <textarea
            ref={textareaRef}
            className={styles.input}
            placeholder="Describe what you'd like to write..."
            rows={3}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onKeyUp={handleCursorMove}
            onClick={handleCursorMove}
          />
          <button
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={!input.trim()}
          >
            <PaperPlaneRight size={14} />
          </button>
        </div>
        {recentDocs.length > 0 && (
          <div className={styles.recentDocs}>
            <div className={styles.recentLabel}>Recent documents</div>
            {recentDocs.map((doc) => (
              <button
                key={doc.id}
                className={styles.recentItem}
                onClick={() => onNavigateToDoc(doc.id)}
              >
                <span>{doc.title || doc.name}</span>
                <span className={styles.recentTime}>
                  {relativeTime(new Date(doc.updatedAt))}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
