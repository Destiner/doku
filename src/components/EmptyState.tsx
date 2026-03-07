import { useState, useRef, useEffect } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react";
import { DocEntry } from "../hooks/useDocs";
import { relativeTime } from "../utils/time";
import styles from "./EmptyState.module.css";

interface Props {
  onSubmit: (message: string) => void;
  recentDocs: DocEntry[];
  onNavigateToDoc: (docId: string) => void;
}

export function EmptyState({ onSubmit, recentDocs, onNavigateToDoc }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    onSubmit(prompt);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.input}
            placeholder="Describe what you'd like to write..."
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
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
