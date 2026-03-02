import { useCallback, useState } from "react";
import { useDocs } from "./hooks/useDocs";
import { DocPanel } from "./components/DocPanel";
import { ChatPanel } from "./components/ChatPanel";
import styles from "./App.module.css";

export function App() {
  const { docs, activeDoc, setActiveDoc, createDoc, deleteDoc, updateDocTitle } = useDocs();
  const [mode, setMode] = useState<"edit" | "view">("view");

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "edit" ? "view" : "edit"));
  }, []);

  const copyPath = useCallback(() => {
    if (!activeDoc) return;
    const textPromise = fetch(`/api/doc/${encodeURIComponent(activeDoc)}/path`)
      .then((res) => res.json())
      .then(({ path }: { path: string }) => new Blob([path], { type: "text/plain" }));
    navigator.clipboard
      .write([new ClipboardItem({ "text/plain": textPromise })])
      .catch((err) => console.error("Failed to copy path:", err));
  }, [activeDoc]);

  return (
    <>
      <header className={styles.header}>
        <span>doku</span>
        <button
          className={`${styles.modeToggle} ${mode === "view" ? styles.modeToggleActive : ""}`}
          onClick={toggleMode}
          title={mode === "edit" ? "Switch to view mode" : "Switch to edit mode"}
        >
          <i className={mode === "edit" ? "ph ph-eye" : "ph ph-pencil-simple"} />
        </button>
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
          <button className={styles.createBtn} onClick={createDoc}>
            +
          </button>
          {activeDoc && (
            <button
              className={styles.copyPathBtn}
              onClick={copyPath}
              title="Copy file path"
            >
              <i className="ph ph-copy" />
            </button>
          )}
          {activeDoc && docs.length > 1 && (
            <button
              className={styles.deleteBtn}
              onClick={() => deleteDoc(activeDoc)}
            >
              &times;
            </button>
          )}
        </div>
      </header>
      <div className={styles.container}>
        <DocPanel docId={activeDoc} mode={mode} />
        <ChatPanel docId={activeDoc} onTitleUpdate={updateDocTitle} />
      </div>
    </>
  );
}
