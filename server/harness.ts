import { spawn } from "bun";
import { readFileSync, writeFileSync } from "fs";
import type { DocMode } from "./storage";

export interface HarnessInput {
  prompt: string;
  docPath: string;
  mode: DocMode;
  sessionId?: string;
  cwd?: string;
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

function buildSystemPrompt(mode: DocMode, docPath: string): string {
  const prompts: Record<string, string> = {
    planning: `You are a planning assistant. You help the user think through ideas, draft plans, and write specs.\nThe shared document is at: ${docPath}\nTo read the current document state, use Read("${docPath}").\nTo write or update the document, use ExitPlanMode with the full document content in the "plan" parameter.\nDo NOT use Edit or Write on the document file directly — always go through ExitPlanMode.\nAlways express plans, research, and proposals through ExitPlanMode — not as chat-only messages.\nThe document is the artifact; chat is for clarifications and brief summaries.\nPrefer using mermaid diagrams where it makes sense.`,
    research: `Your role is to investigate topics, synthesize findings, and write research reports.\nThe shared document is at: ${docPath}\nTo read the current document state, use Read("${docPath}").\nTo write or update the document, use ExitPlanMode with the full document content in the "plan" parameter.\nDo NOT use Edit or Write on the document file directly — always go through ExitPlanMode.\nYou have web tools (WebSearch, WebFetch) available for internet research, but codebase research is equally valid—not all research requires the web.\nAlways write findings and analysis through ExitPlanMode — not as chat-only messages. The document is the artifact; chat is for clarifications and brief summaries.\nPrefer using mermaid diagrams where it makes sense.`,
    general: `Write to the document.\nThe shared document is at: ${docPath}\nTo read the current document state, use Read("${docPath}").\nTo write or update the document, use ExitPlanMode with the full document content in the "plan" parameter.\nDo NOT use Edit or Write on the document file directly — always go through ExitPlanMode.\nAlways write through ExitPlanMode — not as chat-only messages. The document is the artifact; chat is for clarifications and brief summaries.\nPrefer using mermaid diagrams where it makes sense.`,
  };
  return prompts[mode] || prompts.planning;
}

export function buildClaudeCommand(input: HarnessInput): string[] {
  const cmd = [
    "claude",
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "plan",
    "--allowed-tools",
    "Read",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
  ];

  if (input.sessionId) {
    cmd.push("--resume", input.sessionId);
  } else {
    cmd.push(
      "--append-system-prompt",
      buildSystemPrompt(input.mode, input.docPath),
    );
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

    // stream-json format: tool_use blocks are nested in assistant message content
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

          // Intercept ExitPlanMode: write plan content to doc file
          if (block.type === "tool_use" && block.name === "ExitPlanMode") {
            const planInput = block.input as { plan?: string } | undefined;
            if (planInput?.plan) {
              writeFileSync(input.docPath, planInput.plan, "utf-8");
            }
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
