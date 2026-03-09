import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { renderMermaidSVG } from "beautiful-mermaid";
import { useCodeHighlighter } from "../hooks/useCodeHighlighter";
import styles from "./MarkdownViewer.module.css";

function MermaidDiagram({ code }: { code: string }) {
  const { svg, error } = useMemo(() => {
    try {
      return {
        svg: renderMermaidSVG(code, { transparent: true, fg: "#1a1a1a" }),
        error: null,
      };
    } catch (err) {
      return {
        svg: null,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }, [code]);

  if (error) {
    return <pre className={styles.codeBlock}>{error.message}</pre>;
  }
  return (
    <div
      className={styles.mermaidBlock}
      dangerouslySetInnerHTML={{ __html: svg! }}
    />
  );
}

interface Props {
  content: string;
}

export function MarkdownViewer({ content }: Props) {
  const { highlight } = useCodeHighlighter();

  const components: Components = {
    pre: ({ children, node, ...props }) => {
      const codeChild = node?.children?.[0];
      if (
        codeChild?.type === "element" &&
        codeChild.tagName === "code" &&
        Array.isArray(codeChild.properties?.className) &&
        codeChild.properties.className.some((c: string | number) =>
          String(c).startsWith("language-"),
        )
      ) {
        return <>{children}</>;
      }
      return <pre {...props}>{children}</pre>;
    },
    code: ({ children, className, ...props }) => {
      const match = className?.match(/language-(\w+)/);
      if (match) {
        const code = String(children).replace(/\n$/, "");
        const lang = match[1];

        if (lang === "mermaid") {
          return <MermaidDiagram code={code} />;
        }

        const html = highlight(code, lang);
        return (
          <div
            className={styles.codeBlock}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    a: ({ children, href, ...props }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    ),
    table: ({ children, ...props }) => (
      <div className={styles.tableWrapper}>
        <table {...props}>{children}</table>
      </div>
    ),
  };

  return (
    <div className={styles.viewer}>
      <div className={styles.content}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
