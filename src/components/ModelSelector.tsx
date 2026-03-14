import { useState, useRef, useEffect } from "react";
import styles from "./ModelSelector.module.css";

const MODELS = [{ value: "claude-code", label: "Claude Code" }] as const;

function preventFocusSteal(e: React.MouseEvent) {
  e.preventDefault();
}

interface ModelSelectorProps {
  disabled?: boolean;
}

export function ModelSelector({ disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        className={`${styles.trigger} ${disabled ? styles.triggerDisabled : ""}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        onMouseDown={preventFocusSteal}
        type="button"
      >
        <span className={styles.label}>{MODELS[0].label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M2.5 3.75L5 6.25L7.5 3.75"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className={styles.dropdown}>
          {MODELS.map((m) => (
            <button
              key={m.value}
              className={`${styles.option} ${styles.optionActive}`}
              onClick={() => setOpen(false)}
              onMouseDown={preventFocusSteal}
              type="button"
            >
              {m.label}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 6L5 8.5L9.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
