import { spawn } from "bun";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  unlinkSync,
  readdirSync,
} from "fs";
import { join, resolve, extname, relative } from "path";
import { homedir } from "os";
import {
  getProjectDir,
  generateDocId,
  generateDocName,
  getMetadata,
  setMetadata,
  getDocPath,
  resolveDocName,
  encodeProjectPath,
  migrateMetadata,
} from "./storage";
import { describeToolCall, generateToolSummary } from "./src/utils/toolCalls";
let embeddedAssetPaths: Record<string, string> = {};
try {
  embeddedAssetPaths = require("./_assets.gen").assets;
} catch {
  // Dev mode: _assets.gen.ts may reference stale/missing dist files
}

interface TextSegment {
  type: "text";
  content: string;
}

interface ToolCallsSegment {
  type: "toolCalls";
  calls: Array<{ name: string; label: string; detail: string }>;
  collapsed: boolean;
  summary: string;
}

interface AskUserQuestionSegment {
  type: "askUser";
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>;
  answered: boolean;
  answers?: Record<string, string>;
}

type MessageSegment = TextSegment | ToolCallsSegment | AskUserQuestionSegment;

interface ChatMessage {
  role: "user" | "assistant";
  segments: MessageSegment[];
}

const activeProcesses = new Map<string, import("bun").Subprocess>();
const pendingQuestions = new Map<
  string,
  {
    resolve: (answers: Record<string, string> | null) => void;
    questions: AskUserQuestionSegment["questions"];
  }
>();

const isDev = process.env.NODE_ENV === "development";
const PORT = parseInt(process.env.DOKU_PORT || (isDev ? "39483" : "0"), 10);
const DIST_DIR = resolve("./dist");

const HAS_EMBEDDED_ASSETS = Object.keys(embeddedAssetPaths).length > 0;

const PROJECT_CWD = (() => {
  const arg = process.argv[2];
  return arg ? resolve(arg) : process.cwd();
})();

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
}

function parseChatHistory(sessionId: string): ChatMessage[] {
  const encoded = encodeProjectPath(PROJECT_CWD);
  const jsonlPath = join(
    homedir(),
    ".claude",
    "projects",
    encoded,
    `${sessionId}.jsonl`,
  );
  if (!existsSync(jsonlPath)) {
    return [];
  }

  const raw = readFileSync(jsonlPath, "utf-8");
  const lines = raw.split("\n");

  const messages: ChatMessage[] = [];
  const pendingAskUserSegments = new Map<string, AskUserQuestionSegment>();

  // Current assistant turn accumulator — merges consecutive assistant entries
  let currentAssistant: {
    segments: MessageSegment[];
    toolCalls: Array<{ name: string; label: string; detail: string }>;
  } | null = null;

  function flushAssistant() {
    if (!currentAssistant) return;
    // Flush any pending tool calls
    if (currentAssistant.toolCalls.length > 0) {
      currentAssistant.segments.push({
        type: "toolCalls",
        calls: [...currentAssistant.toolCalls],
        collapsed: true,
        summary: generateToolSummary(currentAssistant.toolCalls),
      });
    }
    if (currentAssistant.segments.length > 0) {
      messages.push({ role: "assistant", segments: currentAssistant.segments });
    }
    currentAssistant = null;
  }

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type === "user") {
      const msg = entry.message as { content?: unknown };
      if (msg && typeof msg.content === "string") {
        // Real user message — flush any pending assistant turn first
        flushAssistant();
        messages.push({
          role: "user",
          segments: [{ type: "text", content: msg.content }],
        });
      } else if (msg && Array.isArray(msg.content)) {
        // Tool results — check for AskUserQuestion answers
        for (const block of msg.content as Array<{
          type: string;
          tool_use_id?: string;
          content?: string;
        }>) {
          if (
            block.type === "tool_result" &&
            block.tool_use_id &&
            pendingAskUserSegments.has(block.tool_use_id)
          ) {
            const seg = pendingAskUserSegments.get(block.tool_use_id)!;
            try {
              const result = JSON.parse(block.content || "{}");
              if (result.answers) {
                seg.answers = result.answers;
              }
            } catch {
              // ignore parse errors
            }
            pendingAskUserSegments.delete(block.tool_use_id);
          }
        }
      }
      continue;
    }

    if (entry.type === "assistant") {
      const msg = entry.message as {
        content?: Array<{
          type: string;
          text?: string;
          name?: string;
          id?: string;
          input?: Record<string, unknown>;
        }>;
      };
      if (!msg?.content || !Array.isArray(msg.content)) {
        continue;
      }

      // Start a new assistant turn if there isn't one
      if (!currentAssistant) {
        currentAssistant = { segments: [], toolCalls: [] };
      }

      for (const block of msg.content) {
        if (block.type === "thinking") continue;

        if (block.type === "text" && block.text) {
          // Flush pending tool calls before adding text
          if (currentAssistant.toolCalls.length > 0) {
            currentAssistant.segments.push({
              type: "toolCalls",
              calls: [...currentAssistant.toolCalls],
              collapsed: true,
              summary: generateToolSummary(currentAssistant.toolCalls),
            });
            currentAssistant.toolCalls = [];
          }
          currentAssistant.segments.push({ type: "text", content: block.text });
        }

        if (block.type === "tool_use" && block.name === "AskUserQuestion") {
          // Flush pending tool calls before adding askUser segment
          if (currentAssistant.toolCalls.length > 0) {
            currentAssistant.segments.push({
              type: "toolCalls",
              calls: [...currentAssistant.toolCalls],
              collapsed: true,
              summary: generateToolSummary(currentAssistant.toolCalls),
            });
            currentAssistant.toolCalls = [];
          }
          const input = (block.input || {}) as {
            questions?: AskUserQuestionSegment["questions"];
          };
          const seg: AskUserQuestionSegment = {
            type: "askUser",
            questions: input.questions || [],
            answered: true,
          };
          currentAssistant.segments.push(seg);
          if (block.id) {
            pendingAskUserSegments.set(block.id, seg);
          }
          continue;
        }

        if (block.type === "tool_use" && block.name) {
          const { label, detail } = describeToolCall(
            block.name,
            block.input || {},
          );
          currentAssistant.toolCalls.push({ name: block.name, label, detail });
        }
      }
      continue;
    }
  }

  // Flush final assistant turn
  flushAssistant();

  return messages;
}

migrateMetadata(getProjectDir(PROJECT_CWD));

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // --- Static file serving ---
    if (!pathname.startsWith("/api/")) {
      // Embedded mode: serve from compiled-in assets
      if (HAS_EMBEDDED_ASSETS) {
        const key =
          pathname === "/" || pathname === "/index.html"
            ? "/index.html"
            : pathname;
        const assetPath = embeddedAssetPaths[key];
        if (assetPath) {
          const ext = extname(key);
          return new Response(Bun.file(assetPath), {
            headers: {
              "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
            },
          });
        }
      }

      // Disk mode: serve from dist/ (production, non-embedded)
      if (!isDev && !HAS_EMBEDDED_ASSETS && existsSync(DIST_DIR)) {
        const filePath =
          pathname === "/" || pathname === "/index.html"
            ? join(DIST_DIR, "index.html")
            : join(DIST_DIR, pathname);

        if (existsSync(filePath) && statSync(filePath).isFile()) {
          const ext = extname(filePath);
          return new Response(readFileSync(filePath), {
            headers: {
              "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
            },
          });
        }
      }
    }

    const projectDir = getProjectDir(PROJECT_CWD);

    // --- GET /api/files ---
    if (pathname === "/api/files" && req.method === "GET") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const skip = new Set(["node_modules", ".git", "dist", "bun.lockb"]);
      const results: string[] = [];
      const root = PROJECT_CWD;

      function walk(dir: string) {
        if (results.length >= 20) return;
        let entries: string[];
        try {
          entries = readdirSync(dir);
        } catch {
          return;
        }
        for (const entry of entries) {
          if (results.length >= 20) return;
          if (skip.has(entry)) continue;
          const full = join(dir, entry);
          let st;
          try {
            st = statSync(full);
          } catch {
            continue;
          }
          if (st.isDirectory()) {
            walk(full);
          } else {
            const rel = relative(root, full);
            if (!q || rel.toLowerCase().includes(q)) {
              results.push(rel);
            }
          }
        }
      }

      walk(root);
      return jsonResponse({ files: results });
    }

    // --- GET /api/docs ---
    if (pathname === "/api/docs" && req.method === "GET") {
      const meta = getMetadata(projectDir);
      const docs = Object.entries(meta.docs).map(([id, doc]) => ({
        id,
        name: doc.name,
        title: doc.title,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));
      return jsonResponse({ docs });
    }

    // --- POST /api/docs ---
    if (pathname === "/api/docs" && req.method === "POST") {
      const id = generateDocId();
      const name = generateDocName(projectDir);
      const docPath = getDocPath(projectDir, name);
      writeFileSync(docPath, "", "utf-8");
      const now = new Date().toISOString();
      const meta = getMetadata(projectDir);
      meta.docs[id] = { name, createdAt: now, updatedAt: now };
      setMetadata(projectDir, meta);
      return jsonResponse({ id, name });
    }

    // --- GET /api/last-opened ---
    if (pathname === "/api/last-opened" && req.method === "GET") {
      const meta = getMetadata(projectDir);
      return jsonResponse({ docId: meta.lastOpenedDoc || null });
    }

    // --- PUT /api/last-opened ---
    if (pathname === "/api/last-opened" && req.method === "PUT") {
      const body = await req.json();
      const { docId } = body as { docId: string };
      const meta = getMetadata(projectDir);
      meta.lastOpenedDoc = docId;
      setMetadata(projectDir, meta);
      return jsonResponse({ ok: true });
    }

    // --- POST /api/chat/abort ---
    if (pathname === "/api/chat/abort" && req.method === "POST") {
      const body = await req.json();
      const { docId: abortDocId } = body as { docId: string };
      const pending = pendingQuestions.get(abortDocId);
      if (pending) {
        pending.resolve(null);
        pendingQuestions.delete(abortDocId);
      }
      const proc = activeProcesses.get(abortDocId);
      if (proc) {
        proc.kill("SIGTERM");
        activeProcesses.delete(abortDocId);
        console.log(`[chat] aborted process for doc: ${abortDocId}`);
      }
      return jsonResponse({ ok: true });
    }

    // --- POST /api/chat/answer ---
    if (pathname === "/api/chat/answer" && req.method === "POST") {
      const body = await req.json();
      const { docId: answerDocId, answers } = body as {
        docId: string;
        answers: Record<string, string>;
      };
      const pending = pendingQuestions.get(answerDocId);
      if (!pending) {
        return jsonResponse({ error: "No pending question" }, 404);
      }
      pending.resolve(answers);
      return jsonResponse({ ok: true });
    }

    // --- POST /api/chat ---
    if (pathname === "/api/chat" && req.method === "POST") {
      const body = await req.json();
      const { prompt, docId } = body as { prompt: string; docId: string };
      const meta = getMetadata(projectDir);
      const docMeta = meta.docs[docId];

      if (!docMeta) {
        return jsonResponse({ error: "Document not found" }, 404);
      }

      const docPath = getDocPath(projectDir, docMeta.name);
      if (!existsSync(docPath)) {
        return jsonResponse({ error: "Document file not found" }, 404);
      }

      const currentSessionId = docMeta.sessionId || null;

      const env = { ...process.env };
      delete env.CLAUDECODE;

      const cmd = [
        "claude",
        "-p",
        "--output-format",
        "stream-json",
        "--input-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
        "--disallowed-tools",
        "EnterPlanMode",
        "ExitPlanMode",
      ];

      if (currentSessionId) {
        cmd.push("--resume", currentSessionId);
      } else {
        cmd.push(
          "--append-system-prompt",
          `You are used exclusively for planning. Your role is to help the user think through ideas, draft plans, and write specs—all by editing a shared document.\nThe document is at: ${docPath}\nUse your Read, Edit, and Write tools to view and modify this file when the user asks you to read or change the document.\nAlways write plans, research, and proposals directly into the document—never as chat-only messages. The document is the artifact; chat is for clarifications and brief summaries.`,
        );
      }

      cmd.push(prompt);

      console.log(
        `[chat] spawning claude (doc: ${docId}/${docMeta.name}, session: ${currentSessionId || "new"}) prompt: "${prompt.slice(0, 100)}..."`,
      );

      const proc = spawn({
        cmd,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
        env,
        cwd: PROJECT_CWD,
      });

      activeProcesses.set(docId, proc);

      (async () => {
        const stderrReader = proc.stderr.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;
          console.error(`[claude stderr] ${dec.decode(value)}`);
        }
      })();

      const needsTitle = !docMeta.title;

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const reader = proc.stdout.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let closed = false;
          let sessionCaptured = false;

          function enqueue(data: Uint8Array) {
            if (closed) return;
            try {
              controller.enqueue(data);
            } catch {
              closed = true;
            }
          }

          if (needsTitle) {
            (async () => {
              try {
                const titleEnv = { ...process.env };
                delete titleEnv.CLAUDECODE;
                const titleProc = spawn({
                  cmd: [
                    "claude",
                    "-p",
                    "--model",
                    "haiku",
                    "--output-format",
                    "text",
                    "Generate a short title (3-8 words) for a document based on this user message. Reply with ONLY the title, no quotes or punctuation:\n\n" +
                      prompt,
                  ],
                  stdout: "pipe",
                  stderr: "pipe",
                  env: titleEnv,
                  cwd: PROJECT_CWD,
                });
                const output = await new Response(titleProc.stdout).text();
                const title = output.trim();
                if (title && title.length > 0 && title.length < 200) {
                  const titleMeta = getMetadata(projectDir);
                  if (titleMeta.docs[docId]) {
                    titleMeta.docs[docId].title = title;
                    setMetadata(projectDir, titleMeta);
                  }
                  enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "title", title })}\n\n`,
                    ),
                  );
                  console.log(
                    `[chat] generated title for doc ${docId}: "${title}"`,
                  );
                }
              } catch (err) {
                console.error(`[chat] title generation failed:`, err);
              }
            })();
          }

          // AskUserQuestion detection state
          let serverToolName: string | null = null;
          let serverToolId: string | null = null;
          let serverToolInput = "";

          function captureSession(event: Record<string, unknown>) {
            if (event.session_id && !sessionCaptured) {
              sessionCaptured = true;
              const updatedMeta = getMetadata(projectDir);
              if (updatedMeta.docs[docId]) {
                updatedMeta.docs[docId].sessionId = event.session_id as string;
                updatedMeta.docs[docId].updatedAt = new Date().toISOString();
                setMetadata(projectDir, updatedMeta);
              }
              console.log(
                `[chat] captured session_id: ${event.session_id} for doc: ${docId}`,
              );
            }
          }

          async function processEvent(event: Record<string, unknown>) {
            if (event.type === "error") console.error(`[chat] error:`, event);

            captureSession(event);

            // Track tool_use blocks to detect AskUserQuestion
            if (
              event.type === "content_block_start" &&
              (event.content_block as Record<string, unknown>)?.type ===
                "tool_use"
            ) {
              const cb = event.content_block as Record<string, unknown>;
              serverToolName = (cb.name as string) || null;
              serverToolId = (cb.id as string) || null;
              serverToolInput = "";
              if (serverToolName === "AskUserQuestion") {
                return; // suppress
              }
            }

            if (
              event.type === "content_block_delta" &&
              (event.delta as Record<string, unknown>)?.type ===
                "input_json_delta" &&
              serverToolName === "AskUserQuestion"
            ) {
              serverToolInput +=
                ((event.delta as Record<string, unknown>)
                  ?.partial_json as string) || "";
              return; // suppress
            }

            if (event.type === "content_block_stop" && serverToolName) {
              if (serverToolName === "AskUserQuestion") {
                const toolId = serverToolId;
                let params: { questions?: AskUserQuestionSegment["questions"] };
                try {
                  params = JSON.parse(serverToolInput);
                } catch {
                  params = {};
                }

                // Send ask_user event to frontend
                enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "ask_user", questions: params.questions || [] })}\n\n`,
                  ),
                );

                // Wait for user's answers
                const answers = await new Promise<Record<
                  string,
                  string
                > | null>((resolve) => {
                  pendingQuestions.set(docId, {
                    resolve,
                    questions: params.questions || [],
                  });
                });
                pendingQuestions.delete(docId);

                if (answers && toolId) {
                  // Write tool result to Claude's stdin
                  const toolResult = JSON.stringify({
                    type: "tool_result",
                    tool_use_id: toolId,
                    content: JSON.stringify({ answers }),
                  });
                  proc.stdin.write(toolResult + "\n");
                  proc.stdin.flush();
                  console.log(
                    `[chat] sent AskUserQuestion result for doc: ${docId}`,
                  );
                }

                serverToolName = null;
                serverToolId = null;
                serverToolInput = "";
                return; // don't forward
              }

              // Reset state for non-AskUserQuestion tools
              serverToolName = null;
              serverToolId = null;
              serverToolInput = "";
            }

            enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }

          const keepalive = setInterval(() => {
            enqueue(encoder.encode(": keepalive\n\n"));
          }, 15_000);

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const event = JSON.parse(line);
                  await processEvent(event);
                } catch {
                  // skip non-json lines
                }
              }
            }

            if (buffer.trim()) {
              try {
                const event = JSON.parse(buffer);
                await processEvent(event);
              } catch {
                // skip non-json trailing
              }
            }
          } catch (err) {
            console.error(`[chat] stream error: ${err}`);
            enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`,
              ),
            );
          } finally {
            clearInterval(keepalive);
            try {
              const exitCode = await proc.exited;
              activeProcesses.delete(docId);
              console.log(`[chat] claude exited with code ${exitCode}`);
              enqueue(encoder.encode("data: [DONE]\n\n"));
            } catch (err) {
              console.error(`[chat] exit error: ${err}`);
            }
            if (!closed) {
              try {
                controller.close();
              } catch {
                // already closed
              }
            }
          }
        },
      });

      return new Response(stream, { headers: sseHeaders() });
    }

    // --- Routes with :id parameter ---
    // Match /api/doc/:id/watch
    const watchMatch = pathname.match(/^\/api\/doc\/([^/]+)\/watch$/);
    if (watchMatch && req.method === "GET") {
      const docId = decodeURIComponent(watchMatch[1]);
      const meta = getMetadata(projectDir);
      const docName = resolveDocName(meta, docId);

      if (!docName) {
        return jsonResponse({ error: "Document not found" }, 404);
      }

      const docPath = getDocPath(projectDir, docName);
      if (!existsSync(docPath)) {
        return jsonResponse({ error: "Document file not found" }, 404);
      }

      let lastMtime = statSync(docPath).mtimeMs;
      let closed = false;

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();

          const interval = setInterval(() => {
            if (closed) {
              clearInterval(interval);
              return;
            }
            try {
              const stat = statSync(docPath);
              if (stat.mtimeMs > lastMtime) {
                lastMtime = stat.mtimeMs;
                const content = readFileSync(docPath, "utf-8");
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`),
                );
              }
            } catch {
              // file may be temporarily unavailable
            }
          }, 500);

          const keepalive = setInterval(() => {
            if (closed) {
              clearInterval(keepalive);
              return;
            }
            try {
              controller.enqueue(encoder.encode(": keepalive\n\n"));
            } catch {
              closed = true;
              clearInterval(keepalive);
            }
          }, 15_000);

          req.signal.addEventListener("abort", () => {
            closed = true;
            clearInterval(interval);
            clearInterval(keepalive);
            try {
              controller.close();
            } catch {
              // already closed
            }
          });
        },
      });

      return new Response(stream, { headers: sseHeaders() });
    }

    // Match /api/doc/:id/path
    const pathMatch = pathname.match(/^\/api\/doc\/([^/]+)\/path$/);
    if (pathMatch && req.method === "GET") {
      const docId = decodeURIComponent(pathMatch[1]);
      const meta = getMetadata(projectDir);
      const docName = resolveDocName(meta, docId);

      if (!docName) {
        return jsonResponse({ error: "Document not found" }, 404);
      }

      const docPath = getDocPath(projectDir, docName);
      return jsonResponse({ path: docPath });
    }

    // Match /api/chat/:id/history
    const historyMatch = pathname.match(/^\/api\/chat\/([^/]+)\/history$/);
    if (historyMatch && req.method === "GET") {
      const docId = decodeURIComponent(historyMatch[1]);
      const meta = getMetadata(projectDir);
      const sessionId = meta.docs[docId]?.sessionId;

      if (!sessionId) {
        return jsonResponse({ messages: [] });
      }

      const messages = parseChatHistory(sessionId);
      return jsonResponse({ messages });
    }

    // Match /api/doc/:id
    const docMatch = pathname.match(/^\/api\/doc\/([^/]+)$/);
    if (docMatch) {
      const docId = decodeURIComponent(docMatch[1]);
      const meta = getMetadata(projectDir);
      const docName = resolveDocName(meta, docId);

      if (!docName) {
        return jsonResponse({ error: "Document not found" }, 404);
      }

      const docPath = getDocPath(projectDir, docName);

      // GET /api/doc/:id
      if (req.method === "GET") {
        if (!existsSync(docPath)) {
          return jsonResponse({ error: "Document file not found" }, 404);
        }
        const content = readFileSync(docPath, "utf-8");
        return jsonResponse({ content });
      }

      // PUT /api/doc/:id
      if (req.method === "PUT") {
        if (!existsSync(docPath)) {
          return jsonResponse({ error: "Document file not found" }, 404);
        }
        const body = await req.json();
        const { content } = body as { content: string };
        writeFileSync(docPath, content, "utf-8");
        const putMeta = getMetadata(projectDir);
        if (putMeta.docs[docId]) {
          putMeta.docs[docId].updatedAt = new Date().toISOString();
          setMetadata(projectDir, putMeta);
        }
        return jsonResponse({ ok: true });
      }

      // DELETE /api/doc/:id?ifEmpty
      if (req.method === "DELETE" && url.searchParams.has("ifEmpty")) {
        const content = existsSync(docPath)
          ? readFileSync(docPath, "utf-8")
          : "";
        const hasSession = !!meta.docs[docId]?.sessionId;
        if (content.trim() !== "" || hasSession) {
          return jsonResponse({ deleted: false });
        }
        if (existsSync(docPath)) {
          unlinkSync(docPath);
        }
        const freshMeta = getMetadata(projectDir);
        delete freshMeta.docs[docId];
        if (freshMeta.lastOpenedDoc === docId) {
          delete freshMeta.lastOpenedDoc;
        }
        setMetadata(projectDir, freshMeta);
        return jsonResponse({ deleted: true });
      }

      // DELETE /api/doc/:id
      if (req.method === "DELETE") {
        if (existsSync(docPath)) {
          unlinkSync(docPath);
        }
        const freshMeta = getMetadata(projectDir);
        delete freshMeta.docs[docId];
        if (freshMeta.lastOpenedDoc === docId) {
          delete freshMeta.lastOpenedDoc;
        }
        setMetadata(projectDir, freshMeta);
        return jsonResponse({ ok: true });
      }
    }

    // SPA fallback: serve index.html for non-API routes
    if (!pathname.startsWith("/api/")) {
      const indexAsset = embeddedAssetPaths["/index.html"];
      if (HAS_EMBEDDED_ASSETS && indexAsset) {
        return new Response(Bun.file(indexAsset), {
          headers: { "Content-Type": "text/html" },
        });
      }
      if (!HAS_EMBEDDED_ASSETS) {
        const indexPath = join(DIST_DIR, "index.html");
        if (existsSync(indexPath)) {
          return new Response(readFileSync(indexPath), {
            headers: { "Content-Type": "text/html" },
          });
        }
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

const serverUrl = `http://localhost:${server.port}`;
console.log(`Doku running at ${serverUrl}`);
console.log(`Project dir: ${getProjectDir(PROJECT_CWD)}`);

if (HAS_EMBEDDED_ASSETS) {
  if (process.platform === "darwin") {
    Bun.spawn(["open", serverUrl]);
  } else if (process.platform === "win32") {
    Bun.spawn(["cmd", "/c", "start", "", serverUrl]);
  } else {
    Bun.spawn(["xdg-open", serverUrl]);
  }
}
