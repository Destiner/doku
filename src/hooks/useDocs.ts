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

export interface Ghost {
  mode: DocMode;
}

export function useDocs() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [activeDoc, setActiveDocState] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const activeDocRef = useRef<string | null>(null);
  const materializingRef = useRef<Promise<DocEntry> | null>(null);
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
    if (id) setGhost(null);
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

  const createGhost = useCallback((mode?: DocMode) => {
    setGhost({ mode: mode || "planning" });
    setActiveDocState(null);
  }, []);

  const materializeGhost = useCallback(async (): Promise<DocEntry> => {
    if (materializingRef.current) return materializingRef.current;

    const currentGhost = ghost;
    if (!currentGhost) throw new Error("No ghost to materialize");

    const promise = (async () => {
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: currentGhost.mode }),
      });
      const entry = (await res.json()) as {
        id: string;
        name: string;
        mode: DocMode;
      };
      const now = new Date().toISOString();
      const docEntry: DocEntry = {
        ...entry,
        createdAt: now,
        updatedAt: now,
      };
      setDocs((prev) => [docEntry, ...prev]);
      setGhost(null);
      setActiveDocState(docEntry.id);
      materializingRef.current = null;
      return docEntry;
    })();

    materializingRef.current = promise;
    return promise;
  }, [ghost]);

  const deleteDoc = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/doc/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        setDocs((prev) => prev.filter((d) => d.id !== id));
        if (activeDocRef.current === id) {
          setActiveDocState(null);
          setGhost({ mode: "planning" });
        }
      } catch (err) {
        console.error("Failed to delete doc:", err);
      }
    },
    [setActiveDoc],
  );

  useEffect(() => {
    async function init() {
      await fetchDocs();
      setGhost({ mode: "planning" });
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

  const updateGhostMode = useCallback((mode: DocMode) => {
    setGhost((prev) => (prev ? { ...prev, mode } : prev));
  }, []);

  return {
    docs,
    activeDoc,
    ghost,
    setActiveDoc,
    createGhost,
    materializeGhost,
    deleteDoc,
    updateDocTitle,
    updateDocMode,
    updateGhostMode,
  };
}
