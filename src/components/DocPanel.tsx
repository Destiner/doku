import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownViewer } from "./MarkdownViewer";
import styles from "./DocPanel.module.css";

interface Props {
  mode: "edit" | "view";
  content: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInput: () => void;
  onToggleMode: () => void;
  onCopyMarkdown: () => void;
  markdownCopied?: boolean;
}

export function DocPanel({
  mode,
  content,
  textareaRef,
  onInput,
  onToggleMode,
  onCopyMarkdown,
  markdownCopied,
}: Props) {
  return (
    <div className={styles.panel}>
      <div className={styles.overlay}>
        <button
          className={styles.overlayBtn}
          onClick={onToggleMode}
          title={
            mode === "edit" ? "Switch to view mode" : "Switch to edit mode"
          }
        >
          <i
            className={mode === "edit" ? "ph ph-eye" : "ph ph-pencil-simple"}
          />
        </button>
        <button
          className={styles.overlayBtn}
          onClick={onCopyMarkdown}
          title="Copy as markdown"
        >
          <i className={markdownCopied ? "ph ph-check" : "ph ph-clipboard-text"} />
        </button>
      </div>
      {mode === "edit" ? (
        <MarkdownEditor
          textareaRef={textareaRef}
          onInput={onInput}
          initialContent={content}
        />
      ) : (
        <MarkdownViewer content={content} />
      )}
    </div>
  );
}
