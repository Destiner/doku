import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router";
import { useDoc } from "../hooks/useDoc";
import { useChat } from "../hooks/useChat";
import { useDocs } from "../hooks/useDocs";
import { DocPanel } from "../components/DocPanel";
import { ChatPanel } from "../components/ChatPanel";
import { EmptyState } from "../components/EmptyState";
import { DeleteConfirm } from "../components/DeleteConfirm";
import { useCwdContext } from "../contexts/CwdContext";
import { Plus, CopySimple, Check, Trash } from "@phosphor-icons/react";
import styles from "./DocPage.module.css";

const NEW_DOC_LABEL = "New Document";

type ViewPhase = "compose" | "chat-focused" | "classic";

export function DocPage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { cwd, cwdVersion } = useCwdContext();
  const folderName = cwd ? cwd.split("/").pop() : null;
  const activeDoc = docId ?? null;

  const {
    docs,
    cleanupEmptyDoc,
    persistLastOpened,
    deleteDoc,
    updateDocTitle,
    updateDocMode,
  } = useDocs(cwdVersion);

  useEffect(() => {
    if (activeDoc) {
      persistLastOpened(activeDoc);
    }
  }, [activeDoc, persistLastOpened]);

  const prevDocRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevDocRef.current;
    prevDocRef.current = activeDoc;
    if (prev && prev !== activeDoc) {
      cleanupEmptyDoc(prev);
    }
  }, [activeDoc, cleanupEmptyDoc]);

  const [mode, setMode] = useState<"edit" | "view">("view");
  const toggleMode = useCallback(() => {
    setMode((m) => (m === "edit" ? "view" : "edit"));
  }, []);

  const { textareaRef, handleInput, content } = useDoc(activeDoc);
  const [initialPrompt] = useState<string | null>(
    () => location.state?.initialPrompt ?? null,
  );
  const {
    messages,
    isStreaming,
    sendMessage,
    abortMessage,
    submitAnswers,
    queueMessage,
    removeQueuedMessage,
    messageQueue,
  } = useChat(activeDoc, updateDocTitle, initialPrompt);

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
        {folderName && (
          <Link to="/" className={styles.folderName}>
            {folderName}
          </Link>
        )}
        <div className={styles.divider} />
        <div className={styles.docSwitcher}>
          <select
            className={styles.docSelect}
            value={activeDoc || ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "") navigate("/");
              else navigate(`/doc/${val}`);
            }}
          >
            {docs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title || NEW_DOC_LABEL}
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
            onClick={() => navigate("/")}
            title={NEW_DOC_LABEL}
          >
            <Plus size={16} />
          </button>
          {activeDoc && (
            <button
              className={styles.iconBtn}
              onClick={copyPath}
              title="Copy file path"
            >
              {pathCopied ? <Check size={16} /> : <CopySimple size={16} />}
            </button>
          )}
          {activeDoc && (
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
                  onConfirm={async () => {
                    const remaining = await deleteDoc(activeDoc);
                    setConfirmingDelete(false);
                    if (remaining.length > 0) {
                      navigate(`/doc/${remaining[0].id}`, { replace: true });
                    } else {
                      navigate("/", { replace: true });
                    }
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
            onSubmit={sendMessage}
            recentDocs={recentDocs}
            onNavigateToDoc={(id) => navigate(`/doc/${id}`)}
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
              markdownCopied={mdCopied}
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
