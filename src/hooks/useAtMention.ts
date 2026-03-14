import { useState, useRef, useCallback } from "react";

function detectAtQuery(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  const query = before.slice(atIdx + 1);
  if (/[\s\n]/.test(query)) return null;
  return query;
}

export function useAtMention() {
  const cursorPosRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [input, setInput] = useState("");
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [selectorFiles, setSelectorFiles] = useState<string[]>([]);
  const [selectorIndex, setSelectorIndex] = useState(0);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);
    const pos = e.target.selectionStart ?? val.length;
    cursorPosRef.current = pos;
    setAtQuery(detectAtQuery(val, pos));
  }

  const handleCursorMove = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    cursorPosRef.current = pos;
    setAtQuery(detectAtQuery(input, pos));
  }, [input]);

  function handleFileSelect(file: string) {
    const pos = cursorPosRef.current;
    const before = input.slice(0, pos);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) return;
    const after = input.slice(pos);
    const newInput = before.slice(0, atIdx) + "@" + file + " " + after;
    setInput(newInput);
    setAtQuery(null);
    const newCursor = atIdx + 1 + file.length + 1;
    cursorPosRef.current = newCursor;
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(newCursor, newCursor);
      textareaRef.current?.focus();
    });
  }

  function handleKeyDown(
    e: React.KeyboardEvent,
    onSubmit: () => void,
  ): boolean {
    if (atQuery !== null && selectorFiles.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectorIndex((i) => Math.min(i + 1, selectorFiles.length - 1));
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectorIndex((i) => Math.max(i - 1, 0));
        return true;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleFileSelect(selectorFiles[selectorIndex]);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAtQuery(null);
        return true;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
      return true;
    }

    return false;
  }

  function clearInput() {
    setInput("");
    setAtQuery(null);
  }

  return {
    input,
    setInput,
    textareaRef,
    atQuery,
    selectorFiles,
    selectorIndex,
    setSelectorFiles,
    setSelectorIndex,
    handleInputChange,
    handleCursorMove,
    handleFileSelect,
    handleKeyDown,
    clearInput,
  };
}
