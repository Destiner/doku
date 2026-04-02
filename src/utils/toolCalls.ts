export function basename(path: string): string {
  return path.split("/").pop() || path;
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "\u2026" : str;
}

export function displayPath(filePath: string, cwd: string | null): string {
  if (!cwd) return basename(filePath);
  const cwdPrefix = cwd.endsWith("/") ? cwd : cwd + "/";
  if (filePath.startsWith(cwdPrefix)) {
    return filePath.slice(cwdPrefix.length);
  }
  return filePath;
}

export interface ToolCallDescription {
  label: string;
  detail: string;
}

export function describeToolCall(
  name: string,
  params: Record<string, unknown>,
  cwd: string | null = null,
): ToolCallDescription {
  switch (name) {
    case "Read":
      return {
        label: "Read",
        detail: params.file_path
          ? displayPath(params.file_path as string, cwd)
          : "",
      };
    case "Edit":
      return {
        label: "Edit",
        detail: params.file_path
          ? displayPath(params.file_path as string, cwd)
          : "",
      };
    case "Write":
      return {
        label: "Write",
        detail: params.file_path
          ? displayPath(params.file_path as string, cwd)
          : "",
      };
    case "Bash":
      return {
        label: "Bash",
        detail: params.command ? truncate(params.command as string, 60) : "",
      };
    case "Glob":
      return {
        label: "Glob",
        detail: params.pattern ? truncate(params.pattern as string, 60) : "",
      };
    case "Grep": {
      const pat = params.pattern ? truncate(params.pattern as string, 40) : "";
      const inPath = params.path
        ? ` in ${displayPath(params.path as string, cwd)}`
        : "";
      return { label: "Grep", detail: pat ? `${pat}${inPath}` : "" };
    }
    case "WebFetch":
      return {
        label: "Fetch",
        detail: params.url ? truncate(params.url as string, 60) : "",
      };
    case "Task":
    case "Agent":
      return {
        label: "Run agent",
        detail: params.description
          ? truncate(params.description as string, 60)
          : "",
      };
    case "AskUserQuestion": {
      const qs = params.questions as Array<{ question: string }> | undefined;
      const count = qs?.length ?? 0;
      return {
        label: "Ask user",
        detail: count === 1 ? "1 question" : `${count} questions`,
      };
    }
    case "TodoWrite":
      return { label: "Update tasks", detail: "" };
    case "ToolSearch":
      return {
        label: "Search for tools",
        detail: params.query ? truncate(params.query as string, 60) : "",
      };
    case "WebSearch":
      return {
        label: "Search online",
        detail: params.query ? truncate(params.query as string, 60) : "",
      };
    case "mcp__doku__read_document":
      return { label: "Read document", detail: "" };
    case "mcp__doku__write_document":
      return {
        label: "Write document",
        detail: "",
      };
    case "mcp__doku__edit_document":
      return {
        label: "Edit document",
        detail: "",
      };
    default:
      return { label: name, detail: "" };
  }
}

export function generateToolSummary(
  toolCalls: Array<{ name: string }>,
): string {
  const counts: Record<string, number> = {};
  for (const tc of toolCalls) {
    const key =
      tc.name === "Glob" || tc.name === "Grep"
        ? "Search"
        : tc.name === "Agent"
          ? "Task"
          : tc.name === "ToolSearch"
            ? "ToolSearch"
            : tc.name === "WebSearch"
              ? "WebSearch"
              : tc.name === "mcp__doku__write_document"
                ? "WriteDoc"
                : tc.name === "mcp__doku__edit_document"
                  ? "EditDoc"
                  : tc.name === "mcp__doku__read_document"
                    ? "ReadDoc"
                    : tc.name;
    counts[key] = (counts[key] || 0) + 1;
  }

  const verbMap: Record<string, (n: number) => string> = {
    Read: (n) => `read ${n} file${n > 1 ? "s" : ""}`,
    Edit: (n) => `changed ${n} file${n > 1 ? "s" : ""}`,
    Write: (n) => `made ${n} file${n > 1 ? "s" : ""}`,
    Bash: (n) => `ran ${n} command${n > 1 ? "s" : ""}`,
    Search: (n) => `searched for ${n} pattern${n > 1 ? "s" : ""}`,
    WebFetch: (n) => `fetched ${n} URL${n > 1 ? "s" : ""}`,
    Task: (n) => `ran ${n} agent${n > 1 ? "s" : ""}`,
    AskUserQuestion: (n) => `asked ${n} question${n > 1 ? "s" : ""}`,
    TodoWrite: () => "updated tasks",
    ToolSearch: (n) => `searched for ${n} tool${n > 1 ? "s" : ""}`,
    WebSearch: (n) => `searched online ${n} time${n > 1 ? "s" : ""}`,
    ReadDoc: (n) => `read document ${n} time${n > 1 ? "s" : ""}`,
    WriteDoc: (n) => `wrote document ${n} time${n > 1 ? "s" : ""}`,
    EditDoc: (n) => `edited document ${n} time${n > 1 ? "s" : ""}`,
  };

  const parts: string[] = [];
  for (const [name, count] of Object.entries(counts)) {
    const fn = verbMap[name];
    parts.push(
      fn ? fn(count) : `used ${name} ${count} time${count > 1 ? "s" : ""}`,
    );
  }

  const result = parts.join(", ");
  return result.charAt(0).toUpperCase() + result.slice(1);
}
