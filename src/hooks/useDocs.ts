import { useState, useEffect, useCallback, useRef } from "react";

export type DocMode = "planning" | "research" | "general";

export interface DocEntry {
  id: string;
  name: string;
  mode: DocMode;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export function useDocs() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [activeDoc, setActiveDocState] = useState<string | null>(null);
  const activeDocRef = useRef<string | null>(null);
  useEffect(() => {
    activeDocRef.current = activeDoc;
  }, [activeDoc]);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/docs");
      const { docs: list } = (await res.json()) as { docs: DocEntry[] };
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setDocs(list);
      return list;
    } catch (err) {
      console.error("Failed to fetch docs:", err);
      return [];
    }
  }, []);

  const setActiveDoc = useCallback((id: string | null) => {
    const prevId = activeDocRef.current;
    setActiveDocState(id);
    if (id) {
      fetch("/api/last-opened", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId: id }),
      }).catch((err) => console.error("Failed to persist last opened:", err));
    }
    if (prevId && prevId !== id) {
      fetch(`/api/doc/${encodeURIComponent(prevId)}?ifEmpty`, {
        method: "DELETE",
      })
        .then((res) => res.json())
        .then(({ deleted }: { deleted: boolean }) => {
          if (deleted) {
            setDocs((prev) => prev.filter((d) => d.id !== prevId));
          }
        })
        .catch((err) => console.error("Failed to cleanup empty doc:", err));
    }
  }, []);

  const createDoc = useCallback(
    async (mode?: DocMode) => {
      try {
        const res = await fetch("/api/docs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: mode || "planning" }),
        });
        const {
          id,
          name,
          mode: docMode,
        } = (await res.json()) as {
          id: string;
          name: string;
          mode: DocMode;
        };
        const now = new Date().toISOString();
        setDocs((prev) => [
          { id, name, mode: docMode, createdAt: now, updatedAt: now },
          ...prev,
        ]);
        setActiveDoc(id);
      } catch (err) {
        console.error("Failed to create doc:", err);
      }
    },
    [setActiveDoc],
  );

  const deleteDoc = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/doc/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        setDocs((prev) => {
          const next = prev.filter((d) => d.id !== id);
          if (activeDocRef.current === id) {
            setActiveDoc(next.length > 0 ? next[0].id : null);
          }
          return next;
        });
      } catch (err) {
        console.error("Failed to delete doc:", err);
      }
    },
    [setActiveDoc],
  );

  useEffect(() => {
    async function init() {
      await fetchDocs();
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "planning" }),
      });
      const {
        id,
        name,
        mode: docMode,
      } = (await res.json()) as {
        id: string;
        name: string;
        mode: DocMode;
      };
      const now = new Date().toISOString();
      setDocs((prev) => [
        { id, name, mode: docMode, createdAt: now, updatedAt: now },
        ...prev,
      ]);
      setActiveDocState(id);
    }
    init();
  }, [fetchDocs]);

  const updateDocTitle = useCallback((docId: string, title: string) => {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, title } : d)));
  }, []);

  const updateDocMode = useCallback((docId: string, mode: DocMode) => {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, mode } : d)));
    fetch(`/api/doc/${encodeURIComponent(docId)}/mode`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }).catch((err) => console.error("Failed to update doc mode:", err));
  }, []);

  return {
    docs,
    activeDoc,
    setActiveDoc,
    createDoc,
    deleteDoc,
    updateDocTitle,
    updateDocMode,
  };
}
