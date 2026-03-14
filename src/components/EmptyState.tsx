import { useEffect } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react";
import { DocEntry, DocMode } from "../hooks/useDocs";
import { useAtMention } from "../hooks/useAtMention";
import { relativeTime } from "../utils/time";
import { FileSelector } from "./FileSelector";
import { ModelSelector } from "./ModelSelector";
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
  const {
    input,
    textareaRef,
    atQuery,
    selectorFiles,
    selectorIndex,
    setSelectorFiles,
    setSelectorIndex,
    handleInputChange,
    handleCursorMove,
    handleFileSelect,
    handleKeyDown,
    handleBlur,
    clearInput,
  } = useAtMention();

  useEffect(() => {
    textareaRef.current?.focus();
  }, [textareaRef]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const border = ta.offsetHeight - ta.clientHeight;
    ta.style.height = ta.scrollHeight + border + "px";
  }, [input, textareaRef]);

  function handleSubmit() {
    const prompt = input.trim();
    if (!prompt) return;
    clearInput();
    onSubmit(prompt);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    handleKeyDown(e, handleSubmit);
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
            onKeyDown={onKeyDown}
            onKeyUp={handleCursorMove}
            onClick={handleCursorMove}
            onBlur={handleBlur}
          />
          <div className={styles.inputFooter}>
            <ModelSelector />
            <button
              className={styles.submitButton}
              onClick={handleSubmit}
              disabled={!input.trim()}
            >
              <PaperPlaneRight size={14} />
            </button>
          </div>
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
