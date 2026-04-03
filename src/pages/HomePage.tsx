import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useDoc } from "../hooks/useDoc";
import { useChat } from "../hooks/useChat";
import { useDocs } from "../hooks/useDocs";
import { DocPanel } from "../components/DocPanel";
import { ChatPanel } from "../components/ChatPanel";
import { EmptyState } from "../components/EmptyState";
import { CwdPicker } from "../components/CwdPicker";
import { DirectoryBrowser } from "../components/DirectoryBrowser";
import { Plus } from "@phosphor-icons/react";
import { useCwdContext } from "../contexts/CwdContext";
import styles from "../App.module.css";

const NEW_DOC_LABEL = "New Document";

type ViewPhase = "compose" | "chat-focused" | "classic";

export function HomePage() {
  const navigate = useNavigate();
  const { cwd, cwdVersion, switchProject } = useCwdContext();
  const folderName = cwd ? cwd.split("/").pop() : null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleSwitchProject = useCallback(
    async (path: string) => {
      const ok = await switchProject(path);
      if (ok) navigate("/");
    },
    [switchProject, navigate],
  );

  const handleBrowseSelect = useCallback(
    (path: string) => {
      setBrowserOpen(false);
      handleSwitchProject(path);
    },
    [handleSwitchProject],
  );

  const {
    docs,
    ghost,
    createGhost,
    materializeGhost,
    updateDocTitle,
    updateGhostMode,
  } = useDocs(cwdVersion);

  useEffect(() => {
    if (!ghost) {
      createGhost();
    }
  }, [ghost, createGhost]);

  const activeDocMode = ghost?.mode ?? "planning";

  const { textareaRef, handleInput, content } = useDoc(null);
  const {
    messages,
    isStreaming,
    abortMessage,
    submitAnswers,
    queueMessage,
    removeQueuedMessage,
    messageQueue,
  } = useChat(null, updateDocTitle);

  const wrappedSendMessage = useCallback(
    async (prompt: string) => {
      const entry = await materializeGhost();
      navigate(`/doc/${entry.id}`, {
        replace: true,
        state: { initialPrompt: prompt },
      });
    },
    [materializeGhost, navigate],
  );

  const docIsEmpty = !content || content.trim() === "";
  const chatIsEmpty = messages.length === 0 && !isStreaming;

  const phase: ViewPhase =
    docIsEmpty && chatIsEmpty
      ? "compose"
      : docIsEmpty
        ? "chat-focused"
        : "classic";

  const recentDocs = docs.slice(0, 3);

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

  const [mode, setMode] = useState<"edit" | "view">("view");
  const toggleMode = useCallback(() => {
    setMode((m) => (m === "edit" ? "view" : "edit"));
  }, []);

  return (
    <>
      <header className={styles.header}>
        {folderName && (
          <button
            ref={triggerRef}
            className={styles.folderName}
            onClick={() => setPickerOpen((v) => !v)}
          >
            {folderName}
          </button>
        )}
        <CwdPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onBrowse={() => setBrowserOpen(true)}
          onSelectProject={handleSwitchProject}
          anchorRef={triggerRef}
        />
        <div className={styles.divider} />
        <div className={styles.docSwitcher}>
          <select
            className={styles.docSelect}
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (val) navigate(`/doc/${val}`);
            }}
          >
            <option value="">{NEW_DOC_LABEL}</option>
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
        </div>
      </header>
      <div className={styles.container}>
        {phase === "compose" && (
          <EmptyState
            onSubmit={wrappedSendMessage}
            recentDocs={recentDocs}
            onNavigateToDoc={(id) => navigate(`/doc/${id}`)}
            mode={activeDocMode}
            onModeChange={(m) => updateGhostMode(m)}
            currentDocId={null}
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
            currentDocId={null}
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
              sendMessage={wrappedSendMessage}
              abortMessage={abortMessage}
              submitAnswers={submitAnswers}
              queueMessage={queueMessage}
              removeQueuedMessage={removeQueuedMessage}
              messageQueue={messageQueue}
              currentDocId={null}
            />
          </>
        )}
      </div>
      <DirectoryBrowser
        open={browserOpen}
        onCancel={() => setBrowserOpen(false)}
        onSelect={handleBrowseSelect}
        initialPath={cwd ?? undefined}
      />
    </>
  );
}
