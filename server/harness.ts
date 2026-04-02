import { spawn } from "bun";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import type { DocMode } from "./storage";

export interface HarnessInput {
  prompt: string;
  docPath: string;
  mode: DocMode;
  sessionId?: string;
  cwd?: string;
  mcpConfigPath: string;
}

export interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

export interface HarnessResult {
  events: StreamEvent[];
  sessionId: string | null;
  docContent: string;
  toolsUsed: string[];
}

export function createMcpConfig(docPath: string): string {
  const configPath = `/tmp/doku-mcp-${crypto.randomUUID()}.json`;
  const config = {
    mcpServers: {
      doku: {
        command: "bun",
        args: ["run", resolve(__dirname, "mcp.ts")],
        env: { DOC_PATH: docPath },
      },
    },
  };
  writeFileSync(configPath, JSON.stringify(config));
  return configPath;
}

export function cleanupMcpConfig(configPath: string): void {
  try {
    unlinkSync(configPath);
  } catch {
    // best-effort cleanup
  }
}

function buildSystemPrompt(mode: DocMode): string {
  const docTools = `To read the current document, use \`read_document\`. To replace the entire document, use \`write_document\`. To make targeted changes, use \`edit_document\` with \`old_text\` and \`new_text\`.`;

  const common = [
    docTools,
    "Always write through the document tools — not as chat-only messages. The document is the artifact; chat is for clarifications and brief summaries.",
    "Do NOT implement changes directly — the Write and Edit tools for project files are not available in this session. Focus on writing to the document only.",
    "Prefer using mermaid diagrams where it makes sense.",
  ].join("\n");

  const intros: Record<string, string> = {
    planning:
      "You are a planning assistant. You help the user think through ideas, draft plans, and write specs.",
    research:
      "Your role is to investigate topics, synthesize findings, and write research reports.\nYou have web tools (WebSearch, WebFetch) available for internet research, but codebase research is equally valid—not all research requires the web.",
    general: "Write to the document.",
  };

  const intro = intros[mode] || intros.planning;
  return `${intro}\n${common}`;
}

export function buildClaudeCommand(input: HarnessInput): string[] {
  const cmd = [
    "claude",
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--mcp-config",
    input.mcpConfigPath,
    "--allowed-tools",
    "mcp__doku__read_document",
    "mcp__doku__write_document",
    "mcp__doku__edit_document",
    "Read",
    "Glob",
    "Grep",
    "Bash",
    "WebSearch",
    "WebFetch",
    "AskUserQuestion",
  ];

  cmd.push("--append-system-prompt", buildSystemPrompt(input.mode));

  if (input.sessionId) {
    cmd.push("--resume", input.sessionId);
  }

  cmd.push(input.prompt);
  return cmd;
}

export async function runHarness(input: HarnessInput): Promise<HarnessResult> {
  const cmd = buildClaudeCommand(input);
  const cwd = input.cwd || process.cwd();

  const env = { ...process.env };
  delete env.CLAUDECODE;

  const proc = spawn({
    cmd,
    stdout: "pipe",
    stderr: "pipe",
    env,
    cwd,
  });

  // Drain stderr
  (async () => {
    const reader = proc.stderr.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      console.error(`[harness stderr] ${dec.decode(value)}`);
    }
  })();

  const events: StreamEvent[] = [];
  const toolsUsed: string[] = [];
  let sessionId: string | null = null;

  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function processEvent(event: StreamEvent) {
    events.push(event);

    if (event.session_id && !sessionId) {
      sessionId = event.session_id as string;
    }

    if (event.type === "assistant" && event.message) {
      const msg = event.message as {
        content?: Array<{
          type: string;
          name?: string;
          input?: Record<string, unknown>;
        }>;
      };
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (
            block.type === "tool_use" &&
            block.name &&
            !toolsUsed.includes(block.name)
          ) {
            toolsUsed.push(block.name);
          }
        }
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        processEvent(JSON.parse(line));
      } catch {
        // skip non-json
      }
    }
  }

  if (buffer.trim()) {
    try {
      processEvent(JSON.parse(buffer));
    } catch {
      // skip
    }
  }

  await proc.exited;

  let docContent = "";
  try {
    docContent = readFileSync(input.docPath, "utf-8");
  } catch {
    // doc may not exist
  }

  return { events, sessionId, docContent, toolsUsed };
}
