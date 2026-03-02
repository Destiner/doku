import { useEffect, useRef, useCallback, useState } from "react";

export function useDoc(docId: string | null) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedContent = useRef<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const [content, setContent] = useState("");

  const saveDoc = useCallback(async () => {
    const el = textareaRef.current;
    if (!el || !docId) return;
    const content = el.value;
    if (content === lastSavedContent.current) return;
    lastSavedContent.current = content;
    savingRef.current = true;
    try {
      await fetch(`/api/doc/${encodeURIComponent(docId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error("Failed to save doc:", err);
    } finally {
      savingRef.current = false;
    }
  }, [docId]);

  const handleInput = useCallback(() => {
    if (textareaRef.current) setContent(textareaRef.current.value);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveTimeout.current = null;
      saveDoc();
    }, 300);
  }, [saveDoc]);

  useEffect(() => {
    if (!docId) {
      if (textareaRef.current) textareaRef.current.value = "";
      lastSavedContent.current = null;
      setContent("");
      return;
    }

    async function loadDoc() {
      try {
        const res = await fetch(`/api/doc/${encodeURIComponent(docId!)}`);
        const { content } = await res.json();
        setContent(content);
        if (textareaRef.current) {
          textareaRef.current.value = content;
          lastSavedContent.current = content;
        }
      } catch (err) {
        console.error("Failed to load doc:", err);
      }
    }

    loadDoc();
  }, [docId]);

  useEffect(() => {
    if (!docId) return;

    function connect() {
      const evtSource = new EventSource(
        `/api/doc/${encodeURIComponent(docId!)}/watch`,
      );
      evtSource.onmessage = (e) => {
        try {
          const { content } = JSON.parse(e.data);
          const el = textareaRef.current;
          if (!el) return;

          // Our own save echoing back via the file watcher — skip
          if (content === lastSavedContent.current) return;

          // User has pending unsaved changes or a save is in-flight — skip
          // to avoid overwriting their work with stale content
          if (saveTimeout.current || savingRef.current) return;

          if (content !== el.value) {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            el.value = content;
            lastSavedContent.current = content;
            setContent(content);
            el.setSelectionRange(start, end);
          }
        } catch (err) {
          console.error("Failed to parse watch event:", err);
        }
      };
      evtSource.onerror = () => {
        evtSource.close();
        setTimeout(connect, 2000);
      };
      return evtSource;
    }

    const evtSource = connect();
    return () => evtSource.close();
  }, [docId]);

  return { textareaRef, handleInput, content };
}
