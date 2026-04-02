import { useState } from "react";
import type { AskUserQuestionSegment } from "../hooks/useChat";
import styles from "./AskUserBlock.module.css";

interface Props {
  segment: AskUserQuestionSegment;
  onSubmit: (answers: Record<string, string>) => void;
}

export function AskUserBlock({ segment, onSubmit }: Props) {
  const [selections, setSelections] = useState<Record<string, Set<string>>>(
    () => {
      if (segment.answered && segment.answers) {
        const init: Record<string, Set<string>> = {};
        for (const q of segment.questions) {
          const val = segment.answers[q.question];
          if (val) {
            init[q.question] = new Set(q.multiSelect ? val.split(", ") : [val]);
          }
        }
        return init;
      }
      return {};
    },
  );

  const disabled = segment.answered;

  const allAnswered = segment.questions.every(
    (q) => (selections[q.question]?.size ?? 0) > 0,
  );

  function toggleOption(question: string, label: string, multi: boolean) {
    if (disabled) return;
    setSelections((prev) => {
      const current = prev[question] ?? new Set<string>();
      const next = new Set(current);
      if (multi) {
        if (next.has(label)) next.delete(label);
        else next.add(label);
      } else {
        next.clear();
        next.add(label);
      }
      return { ...prev, [question]: next };
    });
  }

  function handleSubmit() {
    if (!allAnswered || disabled) return;
    const answers: Record<string, string> = {};
    for (const q of segment.questions) {
      const selected = selections[q.question];
      if (selected) {
        answers[q.question] = Array.from(selected).join(", ");
      }
    }
    onSubmit(answers);
  }

  return (
    <div className={styles.block}>
      {segment.questions.map((q) => {
        const selected = selections[q.question] ?? new Set<string>();
        return (
          <div key={q.question} className={styles.questionSection}>
            <div className={styles.header}>{q.header}</div>
            <div className={styles.questionText}>{q.question}</div>
            <div className={styles.options}>
              {q.options.map((opt) => {
                const isSelected = selected.has(opt.label);
                return (
                  <div
                    key={opt.label}
                    className={`${styles.option} ${isSelected ? styles.optionSelected : ""} ${disabled ? styles.optionDisabled : ""}`}
                    onClick={() =>
                      toggleOption(q.question, opt.label, q.multiSelect)
                    }
                  >
                    {q.multiSelect ? (
                      <div
                        className={`${styles.checkbox} ${isSelected ? styles.checkboxSelected : ""}`}
                      >
                        {isSelected && <span className={styles.checkMark} />}
                      </div>
                    ) : (
                      <div
                        className={`${styles.radio} ${isSelected ? styles.radioSelected : ""}`}
                      >
                        {isSelected && <div className={styles.radioDot} />}
                      </div>
                    )}
                    <div className={styles.optionContent}>
                      <div className={styles.optionLabel}>{opt.label}</div>
                      {opt.description && (
                        <div className={styles.optionDescription}>
                          {opt.description}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!disabled && (
        <div className={styles.submitArea}>
          <button
            className={styles.submitButton}
            disabled={!allAnswered}
            onClick={handleSubmit}
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
