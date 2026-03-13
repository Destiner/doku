import { useCallback, useRef, useState } from "react";
import { useDocs } from "./hooks/useDocs";
import { useDoc } from "./hooks/useDoc";
import { useChat } from "./hooks/useChat";
import { DocPanel } from "./components/DocPanel";
import { ChatPanel } from "./components/ChatPanel";
import { EmptyState } from "./components/EmptyState";
import { Plus, CopySimple, Check, Trash } from "@phosphor-icons/react";
import { DeleteConfirm } from "./components/DeleteConfirm";
import styles from "./App.module.css";

type ViewPhase = "compose" | "chat-focused" | "classic";

export function App() {
  const {
    docs,
    activeDoc,
    ghost,
    setActiveDoc,
    createGhost,
    materializeGhost,
    deleteDoc,
    updateDocTitle,
    updateDocMode,
    updateGhostMode,
  } = useDocs();
  const isGhost = ghost !== null && activeDoc === null;
  const [mode, setMode] = useState<"edit" | "view">("view");
  const toggleMode = useCallback(() => {
    setMode((m) => (m === "edit" ? "view" : "edit"));
  }, []);

  const { textareaRef, handleInput, content } = useDoc(activeDoc);
  const {
    messages,
    isStreaming,
    sendMessage,
    abortMessage,
    submitAnswers,
    queueMessage,
    removeQueuedMessage,
    messageQueue,
  } = useChat(activeDoc, updateDocTitle);

  const activeDocEntry = docs.find((d) => d.id === activeDoc);
  const activeDocMode = isGhost
    ? ghost.mode
    : activeDocEntry?.mode || "planning";

  const wrappedSendMessage = useCallback(
    async (prompt: string) => {
      if (isGhost) {
        const entry = await materializeGhost();
        sendMessage(prompt, entry.id);
        return;
      }
      sendMessage(prompt);
    },
    [isGhost, materializeGhost, sendMessage],
  );

  const wrappedHandleInput = useCallback(() => {
    if (isGhost) {
      materializeGhost();
    }
    handleInput();
  }, [isGhost, materializeGhost, handleInput]);

  const docIsEmpty = !content || content.trim() === "";
  const chatIsEmpty = messages.length === 0 && !isStreaming;

  const phase: ViewPhase =
    docIsEmpty && chatIsEmpty
      ? "compose"
      : docIsEmpty
        ? "chat-focused"
        : "classic";

  const [pathCopied, setPathCopied] = useState(false);
  const pathTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copyPath = useCallback(() => {
    if (!activeDoc) return;
    const textPromise = fetch(`/api/doc/${encodeURIComponent(activeDoc)}/path`)
      .then((res) => res.json())
      .then(
        ({ path }: { path: string }) =>
          new Blob([path], { type: "text/plain" }),
      );
    navigator.clipboard
      .write([new ClipboardItem({ "text/plain": textPromise })])
      .then(() => {
        setPathCopied(true);
        clearTimeout(pathTimerRef.current);
        pathTimerRef.current = setTimeout(() => setPathCopied(false), 1500);
      })
      .catch((err) => console.error("Failed to copy path:", err));
  }, [activeDoc]);

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const recentDocs = docs.filter((d) => d.id !== activeDoc).slice(0, 3);

  const [mdCopied, setMdCopied] = useState(false);
  const mdTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copyMarkdown = useCallback(() => {
    if (!content) return;
    navigator.clipboard
      .writeText(content)
      .then(() => {
        setMdCopied(true);
        clearTimeout(mdTimerRef.current);
        mdTimerRef.current = setTimeout(() => setMdCopied(false), 1500);
      })
      .catch((err) => console.error("Failed to copy markdown:", err));
  }, [content]);

  return (
    <>
      <header className={styles.header}>
        <span className={styles.logo}>doku</span>
        <div className={styles.divider} />
        <div className={styles.docSwitcher}>
          <select
            className={styles.docSelect}
            value={activeDoc || ""}
            onChange={(e) => setActiveDoc(e.target.value)}
          >
            {docs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title || "New Document"}
              </option>
            ))}
          </select>
          <svg
            className={styles.chevron}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className={styles.spacer} />
        <div className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            onClick={() => createGhost()}
            title="New document"
          >
            <Plus size={16} />
          </button>
          {activeDoc && !isGhost && (
            <button
              className={styles.iconBtn}
              onClick={copyPath}
              title="Copy file path"
            >
              {pathCopied ? <Check size={16} /> : <CopySimple size={16} />}
            </button>
          )}
          {activeDoc && !isGhost && (
            <div className={styles.deleteWrapper}>
              <button
                className={`${styles.iconBtn} ${styles.deleteBtn}`}
                onClick={() => setConfirmingDelete(true)}
                title="Delete document"
              >
                <Trash size={16} />
              </button>
              {confirmingDelete && (
                <DeleteConfirm
                  onConfirm={() => {
                    deleteDoc(activeDoc);
                    setConfirmingDelete(false);
                  }}
                  onCancel={() => setConfirmingDelete(false)}
                />
              )}
            </div>
          )}
        </div>
      </header>
      <div className={styles.container}>
        {phase === "compose" && (
          <EmptyState
            onSubmit={wrappedSendMessage}
            recentDocs={recentDocs}
            onNavigateToDoc={setActiveDoc}
            mode={activeDocMode}
            onModeChange={(m) => {
              if (isGhost) updateGhostMode(m);
              else if (activeDoc) updateDocMode(activeDoc, m);
            }}
            currentDocId={activeDoc}
          />
        )}
        {phase === "chat-focused" && (
          <ChatPanel
            messages={messages}
            isStreaming={isStreaming}
            sendMessage={wrappedSendMessage}
            abortMessage={abortMessage}
            submitAnswers={submitAnswers}
            queueMessage={queueMessage}
            removeQueuedMessage={removeQueuedMessage}
            messageQueue={messageQueue}
            fullWidth
            currentDocId={activeDoc}
          />
        )}
        {phase === "classic" && (
          <>
            <DocPanel
              mode={mode}
              content={content}
              textareaRef={textareaRef}
              onInput={wrappedHandleInput}
              onToggleMode={toggleMode}
              onCopyMarkdown={copyMarkdown}
              markdownCopied={mdCopied}
            />
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              sendMessage={wrappedSendMessage}
              abortMessage={abortMessage}
              submitAnswers={submitAnswers}
              queueMessage={queueMessage}
              removeQueuedMessage={removeQueuedMessage}
              messageQueue={messageQueue}
              currentDocId={activeDoc}
            />
          </>
        )}
      </div>
    </>
  );
}
