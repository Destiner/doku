import { useEffect, useRef } from "react";
import styles from "./FileSelector.module.css";

interface Props {
  query: string;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onFilesChange: (files: string[]) => void;
  onSelect: (file: string) => void;
  files: string[];
}

export function FileSelector({
  query,
  activeIndex,
  onActiveIndexChange,
  onFilesChange,
  onSelect,
  files,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/files?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((data: { files: string[] }) => {
        onFilesChange(data.files);
        onActiveIndexChange(0);
      })
      .catch(() => onFilesChange([]));
  }, [query, onFilesChange, onActiveIndexChange]);

  useEffect(() => {
    const active = listRef.current?.children[activeIndex] as HTMLElement;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (files.length === 0) return null;

  return (
    <div className={styles.popup} ref={listRef}>
      {files.map((file, i) => (
        <div
          key={file}
          className={`${styles.item} ${i === activeIndex ? styles.active : ""}`}
          onMouseEnter={() => onActiveIndexChange(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(file);
          }}
        >
          {file}
        </div>
      ))}
    </div>
  );
}
