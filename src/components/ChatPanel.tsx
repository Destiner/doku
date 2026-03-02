import { useState, useRef, useEffect, useCallback } from "react";
import { PaperPlaneRight, Stop, X } from "@phosphor-icons/react";
import { useChat } from "../hooks/useChat";
import { ChatMessage } from "./ChatMessage";
import { FileSelector } from "./FileSelector";
import styles from "./ChatPanel.module.css";

interface Props {
  docId: string | null;
  onTitleUpdate?: (docId: string, title: string) => void;
}

function detectAtQuery(
  text: string,
  cursorPos: number,
): string | null {
  const before = text.slice(0, cursorPos);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  const query = before.slice(atIdx + 1);
  if (/[\s\n]/.test(query)) return null;
  return query;
}

export function ChatPanel({ docId, onTitleUpdate }: Props) {
  const {
    messages,
    isStreaming,
    sendMessage,
    abortMessage,
    queueMessage,
    removeQueuedMessage,
    messageQueue,
  } = useChat(docId, onTitleUpdate);
  const [input, setInput] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef(0);

  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [selectorFiles, setSelectorFiles] = useState<string[]>([]);
  const [selectorIndex, setSelectorIndex] = useState(0);

  useEffect(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const border = ta.offsetHeight - ta.clientHeight;
    ta.style.height = ta.scrollHeight + border + "px";
  }, [input]);

  function handleSend() {
    const prompt = input.trim();
    if (!prompt) return;
    setInput("");
    setAtQuery(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    if (isStreaming) {
      queueMessage(prompt);
    } else {
      sendMessage(prompt);
    }
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
      handleSend();
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.messages}>
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            message={msg}
          />
        ))}
        {isStreaming && (
          <div className={styles.workingIndicator}>
            <span className={styles.workingDot} style={{ animationDelay: "0s" }} />
            <span className={styles.workingDot} style={{ animationDelay: "0.15s" }} />
            <span className={styles.workingDot} style={{ animationDelay: "0.3s" }} />
          </div>
        )}
        <div ref={sentinelRef} />
      </div>
      {messageQueue.length > 0 && (
        <div className={styles.queueSection}>
          <div
            className={styles.queueHeader}
            onClick={() => setQueueCollapsed((c) => !c)}
          >
            <i
              className={`ph ph-caret-right ${styles.queueCaret} ${!queueCollapsed ? styles.queueCaretExpanded : ""}`}
            />
            {messageQueue.length} queued message{messageQueue.length !== 1 ? "s" : ""}
          </div>
          {!queueCollapsed && (
            <div className={styles.queueList}>
              {messageQueue.map((msg, i) => (
                <div key={i} className={styles.queueItem}>
                  <span className={styles.queueItemText}>{msg}</span>
                  <button
                    className={styles.queueItemRemove}
                    onClick={() => removeQueuedMessage(i)}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className={styles.inputArea}>
        {atQuery !== null && (
          <FileSelector
            query={atQuery}
            activeIndex={selectorIndex}
            onActiveIndexChange={setSelectorIndex}
            onFilesChange={setSelectorFiles}
            onSelect={handleFileSelect}
            files={selectorFiles}
          />
        )}
        <textarea
          ref={textareaRef}
          className={styles.input}
          placeholder="Ask the agent..."
          rows={1}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onKeyUp={handleCursorMove}
          onClick={handleCursorMove}
        />
        {isStreaming ? (
          <button
            className={`${styles.sendButton} ${styles.stopButton}`}
            onClick={abortMessage}
          >
            <Stop size={12} />
          </button>
        ) : (
          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <PaperPlaneRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
