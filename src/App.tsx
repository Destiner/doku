import { useCallback, useState } from "react";
import { useDocs } from "./hooks/useDocs";
import { useDoc } from "./hooks/useDoc";
import { useChat } from "./hooks/useChat";
import { DocPanel } from "./components/DocPanel";
import { ChatPanel } from "./components/ChatPanel";
import { EmptyState } from "./components/EmptyState";
import styles from "./App.module.css";

type ViewPhase = "compose" | "chat-focused" | "classic";

export function App() {
  const {
    docs,
    activeDoc,
    setActiveDoc,
    createDoc,
    deleteDoc,
    updateDocTitle,
    updateDocMode,
  } = useDocs();
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
  const activeDocMode = activeDocEntry?.mode || "planning";

  const docIsEmpty = !content || content.trim() === "";
  const chatIsEmpty = messages.length === 0 && !isStreaming;

  const phase: ViewPhase =
    docIsEmpty && chatIsEmpty
      ? "compose"
      : docIsEmpty
        ? "chat-focused"
        : "classic";

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
      .catch((err) => console.error("Failed to copy path:", err));
  }, [activeDoc]);

  const recentDocs = docs.filter((d) => d.id !== activeDoc).slice(0, 3);

  const copyMarkdown = useCallback(() => {
    if (!content) return;
    navigator.clipboard
      .writeText(content)
      .catch((err) => console.error("Failed to copy markdown:", err));
  }, [content]);

  return (
    <>
      <header className={styles.header}>
        <span>doku</span>
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
          {phase !== "compose" && (
            <span className={styles.modeBadge}>{activeDocMode}</span>
          )}
          <button className={styles.createBtn} onClick={() => createDoc()}>
            <i className="ph ph-plus" />
            <span>New</span>
          </button>
          {activeDoc && (
            <button
              className={styles.copyPathBtn}
              onClick={copyPath}
              title="Copy file path"
            >
              <i className="ph ph-copy" />
              <span>Copy Path</span>
            </button>
          )}
          {activeDoc && docs.length > 1 && (
            <button
              className={styles.deleteBtn}
              onClick={() => deleteDoc(activeDoc)}
            >
              <i className="ph ph-trash" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </header>
      <div className={styles.container}>
        {phase === "compose" && (
          <EmptyState
            onSubmit={sendMessage}
            recentDocs={recentDocs}
            onNavigateToDoc={setActiveDoc}
            mode={activeDocMode}
            onModeChange={(m) => {
              if (activeDoc) updateDocMode(activeDoc, m);
            }}
            currentDocId={activeDoc}
          />
        )}
        {phase === "chat-focused" && (
          <ChatPanel
            messages={messages}
            isStreaming={isStreaming}
            sendMessage={sendMessage}
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
              onInput={handleInput}
              onToggleMode={toggleMode}
              onCopyMarkdown={copyMarkdown}
            />
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              sendMessage={sendMessage}
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
