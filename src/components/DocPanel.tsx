import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownViewer } from "./MarkdownViewer";
import styles from "./DocPanel.module.css";

interface Props {
  mode: "edit" | "view";
  content: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInput: () => void;
}

export function DocPanel({ mode, content, textareaRef, onInput }: Props) {
  return (
    <div className={styles.panel}>
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
