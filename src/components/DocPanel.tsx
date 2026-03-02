import { useDoc } from "../hooks/useDoc";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownViewer } from "./MarkdownViewer";
import styles from "./DocPanel.module.css";

interface Props {
  docId: string | null;
  mode: "edit" | "view";
}

export function DocPanel({ docId, mode }: Props) {
  const { textareaRef, handleInput, content } = useDoc(docId);

  return (
    <div className={styles.panel}>
      {mode === "edit" ? (
        <MarkdownEditor textareaRef={textareaRef} onInput={handleInput} initialContent={content} />
      ) : (
        <MarkdownViewer content={content} />
      )}
    </div>
  );
}
