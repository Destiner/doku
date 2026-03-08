import { useEffect, useRef, useState } from "react";
import styles from "./FileSelector.module.css";

interface SelectorItem {
  label: string;
  value: string;
  kind: "file" | "plan";
}

interface Props {
  query: string;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onFilesChange: (files: string[]) => void;
  onSelect: (file: string) => void;
  files: string[];
  currentDocId?: string | null;
}

export function FileSelector({
  query,
  activeIndex,
  onActiveIndexChange,
  onFilesChange,
  onSelect,
  currentDocId,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<SelectorItem[]>([]);

  useEffect(() => {
    const filesFetch = fetch(`/api/files?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((data: { files: string[] }) => data.files)
      .catch(() => [] as string[]);

    const docsFetch = fetch("/api/docs")
      .then((r) => r.json())
      .then(
        async (data: {
          docs: Array<{ id: string; name: string; title?: string }>;
        }) => {
          const filtered = data.docs.filter((d) => {
            if (!d.title) return false;
            if (currentDocId && d.id === currentDocId) return false;
            return (
              !query || d.title.toLowerCase().includes(query.toLowerCase())
            );
          });
          const withPaths = await Promise.all(
            filtered.map(async (d) => {
              const res = await fetch(
                `/api/doc/${encodeURIComponent(d.id)}/path`,
              );
              const { path } = (await res.json()) as { path: string };
              return { id: d.id, label: d.title!, path };
            }),
          );
          return withPaths;
        },
      )
      .catch(() => [] as Array<{ id: string; label: string; path: string }>);

    Promise.all([filesFetch, docsFetch]).then(([fileResults, docResults]) => {
      const combined: SelectorItem[] = [
        ...docResults.map((d) => ({
          label: d.label,
          value: d.path,
          kind: "plan" as const,
        })),
        ...fileResults.map((f) => ({
          label: f,
          value: f,
          kind: "file" as const,
        })),
      ];
      setItems(combined);
      onFilesChange(combined.map((i) => i.value));
      onActiveIndexChange(0);
    });
  }, [query, onFilesChange, onActiveIndexChange, currentDocId]);

  useEffect(() => {
    const active = listRef.current?.children[activeIndex] as HTMLElement;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (items.length === 0) return null;

  return (
    <div className={styles.popup} ref={listRef}>
      {items.map((item, i) => (
        <div
          key={`${item.kind}-${item.value}`}
          className={`${styles.item} ${i === activeIndex ? styles.active : ""}`}
          onMouseEnter={() => onActiveIndexChange(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item.value);
          }}
        >
          <span className={styles.itemKind}>
            {item.kind === "plan" ? "plan" : "file"}
          </span>
          {item.label}
        </div>
      ))}
    </div>
  );
}
