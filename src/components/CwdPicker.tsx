import { useEffect, useRef, useState } from "react";
import { FolderOpen } from "@phosphor-icons/react";
import styles from "./CwdPicker.module.css";

interface Project {
  path: string;
  name: string;
}

export function CwdPicker({
  open,
  onClose,
  onBrowse,
  onSelectProject,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  onBrowse: () => void;
  onSelectProject: (path: string) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: { projects: Project[] }) => setProjects(data.projects))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div className={styles.popover} ref={popoverRef}>
      {projects.length > 0 && (
        <div className={styles.recentSection}>
          <div className={styles.sectionLabel}>Recent Projects</div>
          <ul className={styles.projectList}>
            {projects.map((p) => (
              <li key={p.path}>
                <button
                  className={styles.projectItem}
                  onClick={() => {
                    onClose();
                    onSelectProject(p.path);
                  }}
                >
                  <span className={styles.projectName}>{p.name}</span>
                  <span className={styles.projectPath}>{p.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        className={styles.browseBtn}
        onClick={() => {
          onClose();
          onBrowse();
        }}
      >
        <FolderOpen size={16} />
        Open Project
      </button>
    </div>
  );
}
