import { useState, useRef, useEffect } from "react";
import { Stop, X } from "@phosphor-icons/react";
import { ChatMessage as ChatMessageType } from "../hooks/useChat";
import { useAtMention } from "../hooks/useAtMention";
import { ChatMessage } from "./ChatMessage";
import { FileSelector } from "./FileSelector";
import { ModelSelector } from "./ModelSelector";
import styles from "./ChatPanel.module.css";

interface Props {
  messages: ChatMessageType[];
  isStreaming: boolean;
  sendMessage: (prompt: string) => void;
  abortMessage: () => void;
  submitAnswers: (answers: Record<string, string>) => void;
  queueMessage: (prompt: string) => void;
  removeQueuedMessage: (index: number) => void;
  messageQueue: string[];
  fullWidth?: boolean;
  currentDocId?: string | null;
}

export function ChatPanel({
  messages,
  isStreaming,
  sendMessage,
  abortMessage,
  submitAnswers,
  queueMessage,
  removeQueuedMessage,
  messageQueue,
  fullWidth,
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

  const sentinelRef = useRef<HTMLDivElement>(null);
  const [queueCollapsed, setQueueCollapsed] = useState(false);

  useEffect(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const border = ta.offsetHeight - ta.clientHeight;
    ta.style.height = ta.scrollHeight + border + "px";
  }, [input, textareaRef]);

  function handleSend() {
    const prompt = input.trim();
    if (!prompt) return;
    clearInput();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    if (isStreaming) {
      queueMessage(prompt);
    } else {
      sendMessage(prompt);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    handleKeyDown(e, handleSend);
  }

  const panelClass = fullWidth
    ? `${styles.panel} ${styles.panelFullWidth}`
    : styles.panel;
  const messagesClass = fullWidth
    ? `${styles.messages} ${styles.messagesFullWidth}`
    : styles.messages;
  const inputAreaClass = fullWidth
    ? `${styles.inputArea} ${styles.inputAreaFullWidth}`
    : styles.inputArea;
  const queueSectionClass = fullWidth
    ? `${styles.queueSection} ${styles.queueSectionFullWidth}`
    : styles.queueSection;

  const fileSelectorEl = atQuery !== null && (
    <FileSelector
      query={atQuery}
      activeIndex={selectorIndex}
      onActiveIndexChange={setSelectorIndex}
      onFilesChange={setSelectorFiles}
      onSelect={handleFileSelect}
      files={selectorFiles}
      currentDocId={currentDocId}
    />
  );

  const textareaEl = (
    <textarea
      ref={textareaRef}
      className={styles.input}
      placeholder="Ask the agent..."
      rows={1}
      value={input}
      onChange={handleInputChange}
      onKeyDown={onKeyDown}
      onKeyUp={handleCursorMove}
      onClick={handleCursorMove}
      onBlur={handleBlur}
    />
  );

  const footerEl = (
    <div className={styles.inputFooter}>
      <ModelSelector />
      {isStreaming ? (
        <button
          className={`${styles.sendButton} ${styles.stopButton}`}
          onClick={abortMessage}
        >
          <Stop size={14} />
        </button>
      ) : (
        <button
          className={styles.sendButton}
          onClick={handleSend}
          disabled={!input.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M14 2L7 9M14 2L9.5 14L7 9M14 2L2 6.5L7 9"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );

  const queueEl = messageQueue.length > 0 && (
    <>
      <div
        className={styles.queueHeader}
        onClick={() => setQueueCollapsed((c) => !c)}
      >
        <i
          className={`ph ph-caret-right ${styles.queueCaret} ${!queueCollapsed ? styles.queueCaretExpanded : ""}`}
        />
        {messageQueue.length} queued message
        {messageQueue.length !== 1 ? "s" : ""}
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
    </>
  );

  return (
    <div className={panelClass}>
      <div className={messagesClass}>
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} onSubmitAnswers={submitAnswers} />
        ))}
        {isStreaming && (
          <div className={styles.workingIndicator}>
            <span
              className={styles.workingDot}
              style={{ animationDelay: "0s" }}
            />
            <span
              className={styles.workingDot}
              style={{ animationDelay: "0.15s" }}
            />
            <span
              className={styles.workingDot}
              style={{ animationDelay: "0.3s" }}
            />
          </div>
        )}
        <div ref={sentinelRef} />
      </div>
      {!fullWidth && messageQueue.length > 0 && (
        <div className={queueSectionClass}>{queueEl}</div>
      )}
      <div className={inputAreaClass}>
        {fullWidth ? (
          <>
            {messageQueue.length > 0 && (
              <div className={styles.queueSectionFloating}>{queueEl}</div>
            )}
            <div className={styles.inputAreaFullWidthInner}>
              {fileSelectorEl}
              {textareaEl}
              {footerEl}
            </div>
          </>
        ) : (
          <>
            {fileSelectorEl}
            {textareaEl}
            {footerEl}
          </>
        )}
      </div>
    </div>
  );
}
