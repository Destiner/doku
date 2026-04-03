import { useCallback, useEffect, useState } from "react";
import {
  CaretRight,
  Folder,
  FolderOpen,
  ArrowBendUpLeft,
} from "@phosphor-icons/react";
import styles from "./DirectoryBrowser.module.css";

interface DirEntry {
  name: string;
  path: string;
}

interface TreeNode {
  entry: DirEntry;
  children: TreeNode[] | null;
  expanded: boolean;
}

async function fetchDirectories(path?: string): Promise<{
  path: string;
  directories: DirEntry[];
}> {
  const params = path ? `?path=${encodeURIComponent(path)}` : "";
  const res = await fetch(`/api/directories${params}`);
  return res.json();
}

function DirectoryRow({
  node,
  depth,
  selected,
  onToggle,
  onNavigate,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: boolean;
  onToggle: (path: string) => void;
  onNavigate: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <>
      <div
        className={`${styles.dirRow} ${selected ? styles.dirRowSelected : ""}`}
        style={{ paddingLeft: `${16 + depth * 20}px` }}
        onClick={() => onSelect(node.entry.path)}
      >
        <span
          className={`${styles.caret} ${node.expanded ? styles.caretOpen : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.entry.path);
          }}
        >
          <CaretRight size={12} weight="bold" />
        </span>
        <span
          className={styles.dirEntry}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(node.entry.path);
          }}
        >
          {node.expanded ? (
            <FolderOpen size={16} className={styles.folderIcon} />
          ) : (
            <Folder size={16} className={styles.folderIcon} />
          )}
          <span className={styles.dirName}>{node.entry.name}</span>
        </span>
      </div>
      {node.expanded &&
        node.children?.map((child) => (
          <DirectoryRow
            key={child.entry.path}
            node={child}
            depth={depth + 1}
            selected={selected === false && child.entry.path === ""}
            onToggle={onToggle}
            onNavigate={onNavigate}
            onSelect={onSelect}
          />
        ))}
      {node.expanded && node.children?.length === 0 && (
        <div
          className={styles.emptyDir}
          style={{ paddingLeft: `${16 + (depth + 1) * 20}px` }}
        >
          No subdirectories
        </div>
      )}
    </>
  );
}

function navigateTo(
  path: string,
  setRootPath: (p: string) => void,
  setTree: (t: TreeNode[]) => void,
  setSelectedPath: (p: string | null) => void,
  setLoading: (l: boolean) => void,
) {
  setLoading(true);
  setSelectedPath(null);
  fetchDirectories(path).then((data) => {
    setRootPath(data.path);
    setTree(
      data.directories.map((d) => ({
        entry: d,
        children: null,
        expanded: false,
      })),
    );
    setLoading(false);
  });
}

export function DirectoryBrowser({
  open,
  onCancel,
  onSelect,
  initialPath,
}: {
  open: boolean;
  onCancel: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}) {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const startPath = initialPath
      ? initialPath.split("/").slice(0, -1).join("/") || "/"
      : undefined;
    navigateTo(
      startPath ?? "",
      setRootPath,
      setTree,
      setSelectedPath,
      setLoading,
    );
  }, [open, initialPath]);

  const handleNavigate = useCallback((path: string) => {
    navigateTo(path, setRootPath, setTree, setSelectedPath, setLoading);
  }, []);

  const navigateUp = useCallback(() => {
    if (!rootPath || rootPath === "/") return;
    const parent = rootPath.split("/").slice(0, -1).join("/") || "/";
    navigateTo(parent, setRootPath, setTree, setSelectedPath, setLoading);
  }, [rootPath]);

  const toggleNode = useCallback((path: string) => {
    function updateTree(nodes: TreeNode[]): TreeNode[] {
      return nodes.map((n) => {
        if (n.entry.path === path) {
          if (n.expanded) {
            return { ...n, expanded: false };
          }
          if (n.children === null) {
            fetchDirectories(path).then((data) => {
              setTree((prev) => {
                function setChildren(nodes: TreeNode[]): TreeNode[] {
                  return nodes.map((node) => {
                    if (node.entry.path === path) {
                      return {
                        ...node,
                        expanded: true,
                        children: data.directories.map((d) => ({
                          entry: d,
                          children: null,
                          expanded: false,
                        })),
                      };
                    }
                    if (node.children) {
                      return { ...node, children: setChildren(node.children) };
                    }
                    return node;
                  });
                }
                return setChildren(prev);
              });
            });
            return { ...n, expanded: true, children: [] };
          }
          return { ...n, expanded: true };
        }
        if (n.children) {
          return { ...n, children: updateTree(n.children) };
        }
        return n;
      });
    }
    setTree((prev) => updateTree(prev));
  }, []);

  if (!open) return null;

  const effectivePath = selectedPath ?? rootPath;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Browse directories</span>
          {rootPath && <span className={styles.currentPath}>{rootPath}</span>}
        </div>
        <div className={styles.tree}>
          {loading && tree.length === 0 ? (
            <div className={styles.emptyDir}>Loading...</div>
          ) : (
            <>
              {rootPath && rootPath !== "/" && (
                <div className={styles.parentRow} onClick={navigateUp}>
                  <span className={styles.caret}>
                    <ArrowBendUpLeft size={12} weight="bold" />
                  </span>
                  <span className={styles.dirName}>..</span>
                </div>
              )}
              {tree.length === 0 && !loading ? (
                <div className={styles.emptyDir}>No subdirectories</div>
              ) : (
                tree.map((node) => (
                  <DirectoryRow
                    key={node.entry.path}
                    node={node}
                    depth={0}
                    selected={selectedPath === node.entry.path}
                    onToggle={toggleNode}
                    onNavigate={handleNavigate}
                    onSelect={setSelectedPath}
                  />
                ))
              )}
            </>
          )}
        </div>
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={styles.selectBtn}
            onClick={() => {
              if (effectivePath) onSelect(effectivePath);
            }}
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
