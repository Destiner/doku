import { useEffect, useRef } from "react";
import styles from "./DeleteConfirm.module.css";

interface DeleteConfirmProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirm({ onConfirm, onCancel }: DeleteConfirmProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onCancel]);

  return (
    <div className={styles.popover} ref={ref}>
      <span className={styles.label}>Are you sure?</span>
      <div className={styles.sep} />
      <button className={styles.deleteBtn} onClick={onConfirm}>
        Delete
      </button>
      <button className={styles.cancelBtn} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
