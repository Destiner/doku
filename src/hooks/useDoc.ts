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

    let disposed = false;

    function applyUpdate(newContent: string) {
      if (newContent === lastSavedContent.current) return;
      if (saveTimeout.current || savingRef.current) return;

      lastSavedContent.current = newContent;
      setContent(newContent);

      const el = textareaRef.current;
      if (el && newContent !== el.value) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.value = newContent;
        el.setSelectionRange(start, end);
      }
    }

    // SSE for low-latency updates
    let currentEvt: EventSource | null = null;
    function connect() {
      if (disposed) return;
      const evtSource = new EventSource(
        `/api/doc/${encodeURIComponent(docId!)}/watch`,
      );
      currentEvt = evtSource;
      evtSource.onmessage = (e) => {
        try {
          const { content } = JSON.parse(e.data);
          applyUpdate(content);
        } catch (err) {
          console.error("Failed to parse watch event:", err);
        }
      };
      evtSource.onerror = () => {
        evtSource.close();
        if (!disposed) setTimeout(connect, 2000);
      };
    }
    connect();

    // Polling fallback — catches updates if SSE is buffered by proxy
    const poll = setInterval(async () => {
      if (disposed || saveTimeout.current || savingRef.current) return;
      try {
        const res = await fetch(`/api/doc/${encodeURIComponent(docId!)}`);
        if (!res.ok || disposed) return;
        const { content } = await res.json();
        applyUpdate(content);
      } catch {
        // ignore
      }
    }, 2000);

    return () => {
      disposed = true;
      currentEvt?.close();
      clearInterval(poll);
    };
  }, [docId]);

  return { textareaRef, handleInput, content };
}
