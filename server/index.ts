import { spawn } from "bun";
import { existsSync, readFileSync, statSync, readdirSync } from "fs";
import { join, resolve, extname, relative } from "path";
import { homedir } from "os";
import { encodeProjectPath, getActiveSessionId } from "./storage";
import {
  type StorageProvider,
  FileSystemStorage,
  EphemeralStorage,
  generateDocId,
} from "./storage-provider";
import { describeToolCall, generateToolSummary } from "../src/utils/toolCalls";
import { buildClaudeCommand } from "./harness";
let embeddedAssetPaths: Record<string, string> = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  embeddedAssetPaths = require("../_assets.gen").assets;
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
const capturedSessions = new Map<string, string>();

const isDev = process.env.NODE_ENV === "development";
const PORT = parseInt(process.env.DOKU_PORT || (isDev ? "39483" : "0"), 10);
const DIST_DIR = resolve("./dist");

const HAS_EMBEDDED_ASSETS = Object.keys(embeddedAssetPaths).length > 0;

const isPlayground =
  process.argv.includes("--playground") || process.env.DOKU_PLAYGROUND === "1";

const PROJECT_CWD = (() => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  return args[0] ? resolve(args[0]) : process.cwd();
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

// Check that Claude CLI is installed
if (!Bun.which("claude")) {
  console.error(
    "Error: 'claude' CLI not found. Please install it first: https://claude.com/product/claude-code",
  );
  process.exit(1);
}

const storage: StorageProvider = isPlayground
  ? new EphemeralStorage()
  : new FileSystemStorage(PROJECT_CWD);

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
      const meta = storage.getMetadata();
      const docs = Object.entries(meta.docs).map(([id, doc]) => ({
        id,
        name: doc.name,
        mode: doc.mode,
        title: doc.title,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));
      return jsonResponse({ docs });
    }

    // --- POST /api/docs ---
    if (pathname === "/api/docs" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { mode: reqMode } = body as { mode?: string };
      const docMode =
        reqMode === "research" || reqMode === "general" ? reqMode : "planning";
      const id = generateDocId();
      const name = storage.generateDocName();
      storage.setDocContent(name, "");
      const now = new Date().toISOString();
      const meta = storage.getMetadata();
      meta.docs[id] = { name, mode: docMode, createdAt: now, updatedAt: now };
      storage.setMetadata(meta);
      return jsonResponse({ id, name, mode: docMode });
    }

    // --- GET /api/last-opened ---
    if (pathname === "/api/last-opened" && req.method === "GET") {
      const meta = storage.getMetadata();
      return jsonResponse({ docId: meta.lastOpenedDoc || null });
    }

    // --- PUT /api/last-opened ---
    if (pathname === "/api/last-opened" && req.method === "PUT") {
      const body = await req.json();
      const { docId } = body as { docId: string };
      const meta = storage.getMetadata();
      meta.lastOpenedDoc = docId;
      storage.setMetadata(meta);
      return jsonResponse({ ok: true });
    }

    // --- GET /api/cwd ---
    if (pathname === "/api/cwd" && req.method === "GET") {
      return jsonResponse({ cwd: PROJECT_CWD });
    }

    // --- POST /api/chat/abort ---
    if (pathname === "/api/chat/abort" && req.method === "POST") {
      const body = await req.json();
      const { docId: abortDocId } = body as { docId: string };
      const proc = activeProcesses.get(abortDocId);
      if (proc) {
        proc.kill("SIGTERM");
        activeProcesses.delete(abortDocId);
        console.log(`[chat] aborted process for doc: ${abortDocId}`);
      }
      return jsonResponse({ ok: true });
    }

    // --- POST /api/chat ---
    if (pathname === "/api/chat" && req.method === "POST") {
      const body = await req.json();
      const { prompt, docId } = body as { prompt: string; docId: string };
      const meta = storage.getMetadata();
      const docMeta = meta.docs[docId];

      if (!docMeta) {
        return jsonResponse({ error: "Document not found" }, 404);
      }

      if (!storage.docExists(docMeta.name)) {
        return jsonResponse({ error: "Document file not found" }, 404);
      }

      const docPath = storage.getDocFilePath(docMeta.name);

      const currentSessionId = getActiveSessionId(docMeta);

      const env = { ...process.env };
      delete env.CLAUDECODE;

      const cmd = buildClaudeCommand({
        prompt,
        docPath,
        mode: docMeta.mode,
        sessionId: currentSessionId ?? undefined,
      });

      console.log(
        `[chat] spawning claude (doc: ${docId}/${docMeta.name}, session: ${currentSessionId || "new"}) prompt: "${prompt.slice(0, 100)}..."`,
      );

      const proc = spawn({
        cmd,
        stdout: "pipe",
        stderr: "pipe",
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
        type: "direct",
        async pull(controller) {
          const encoder = new TextEncoder();
          const reader = proc.stdout.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let closed = false;
          let sessionCaptured = false;

          function enqueue(data: Uint8Array) {
            if (closed) return;
            try {
              controller.write(data);
              controller.flush();
            } catch {
              closed = true;
            }
          }

          let titlePromise: Promise<void> | null = null;
          if (needsTitle) {
            titlePromise = (async () => {
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
                  const titleMeta = storage.getMetadata();
                  if (titleMeta.docs[docId]) {
                    titleMeta.docs[docId].title = title;
                    storage.setMetadata(titleMeta);
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

          function captureSession(event: Record<string, unknown>) {
            if (event.session_id && !sessionCaptured) {
              sessionCaptured = true;
              capturedSessions.set(docId, event.session_id as string);
              const updatedMeta = storage.getMetadata();
              if (updatedMeta.docs[docId]) {
                const sid = event.session_id as string;
                const now = new Date().toISOString();
                const doc = updatedMeta.docs[docId];
                if (!doc.sessions) {
                  doc.sessions = [];
                }
                const existingIdx = doc.sessions.findIndex(
                  (s) => s.sessionId === sid,
                );
                if (existingIdx === -1) {
                  doc.sessions.push({ sessionId: sid, createdAt: now });
                  doc.activeSessionIndex = doc.sessions.length - 1;
                }
                doc.updatedAt = now;
                storage.setMetadata(updatedMeta);
              }
              console.log(
                `[chat] captured session_id: ${event.session_id} for doc: ${docId}`,
              );
            }
          }

          // When true, suppress all remaining events (after AskUserQuestion)
          let suppressAfterAskUser = false;

          function processEvent(event: Record<string, unknown>) {
            if (event.type === "error") console.error(`[chat] error:`, event);

            captureSession(event);

            if (suppressAfterAskUser) return;

            // Detect AskUserQuestion in assistant message content blocks
            if (event.type === "assistant") {
              const msg = event.message as
                | {
                    content?: Array<{ type: string; name?: string }>;
                  }
                | undefined;
              if (Array.isArray(msg?.content)) {
                for (const block of msg!.content) {
                  if (
                    block.type === "tool_use" &&
                    block.name === "AskUserQuestion"
                  ) {
                    // Suppress this event and all further events
                    // (the CLI will auto-deny the tool and Claude will respond
                    // about the denial — we don't want that shown to the user)
                    suppressAfterAskUser = true;
                    return;
                  }
                }
              }
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
            } catch (err) {
              console.error(`[chat] exit error: ${err}`);
            }
            if (titlePromise) {
              await titlePromise;
            }
            enqueue(encoder.encode("data: [DONE]\n\n"));
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
      const docName = storage.resolveDocName(docId);

      if (!docName) {
        return jsonResponse({ error: "Document not found" }, 404);
      }

      if (!storage.docExists(docName)) {
        return jsonResponse({ error: "Document file not found" }, 404);
      }

      let lastMtime = storage.getDocMtime(docName) ?? 0;
      let closed = false;

      const stream = new ReadableStream({
        type: "direct",
        pull(controller) {
          const encoder = new TextEncoder();

          const interval = setInterval(() => {
            if (closed) {
              clearInterval(interval);
              return;
            }
            try {
              const mtime = storage.getDocMtime(docName);
              if (mtime && mtime > lastMtime) {
                lastMtime = mtime;
                const content = storage.getDocContent(docName);
                if (content !== null) {
                  controller.write(
                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`),
                  );
                  controller.flush();
                }
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
              controller.write(encoder.encode(": keepalive\n\n"));
              controller.flush();
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

          return new Promise(() => {});
        },
      });

      return new Response(stream, { headers: sseHeaders() });
    }

    // Match /api/doc/:id/mode
    const modeMatch = pathname.match(/^\/api\/doc\/([^/]+)\/mode$/);
    if (modeMatch && req.method === "PUT") {
      const docId = decodeURIComponent(modeMatch[1]);
      const body = await req.json();
      const { mode: newMode } = body as { mode: string };
      if (
        newMode !== "planning" &&
        newMode !== "research" &&
        newMode !== "general"
      ) {
        return jsonResponse({ error: "Invalid mode" }, 400);
      }
      const meta = storage.getMetadata();
      if (!meta.docs[docId]) {
        return jsonResponse({ error: "Document not found" }, 404);
      }
      meta.docs[docId].mode = newMode;
      storage.setMetadata(meta);
      return jsonResponse({ ok: true });
    }

    // Match /api/doc/:id/path
    const pathMatch = pathname.match(/^\/api\/doc\/([^/]+)\/path$/);
    if (pathMatch && req.method === "GET") {
      const docId = decodeURIComponent(pathMatch[1]);
      const docName = storage.resolveDocName(docId);

      if (!docName) {
        return jsonResponse({ error: "Document not found" }, 404);
      }

      return jsonResponse({ path: storage.getDocFilePath(docName) });
    }

    // Match /api/chat/:id/history
    const historyMatch = pathname.match(/^\/api\/chat\/([^/]+)\/history$/);
    if (historyMatch && req.method === "GET") {
      const docId = decodeURIComponent(historyMatch[1]);
      const meta = storage.getMetadata();
      const sessionId =
        (meta.docs[docId] ? getActiveSessionId(meta.docs[docId]) : null) ||
        capturedSessions.get(docId);

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
      const docName = storage.resolveDocName(docId);

      if (!docName) {
        return jsonResponse({ error: "Document not found" }, 404);
      }

      // GET /api/doc/:id
      if (req.method === "GET") {
        const content = storage.getDocContent(docName);
        if (content === null) {
          return jsonResponse({ error: "Document file not found" }, 404);
        }
        return jsonResponse({ content });
      }

      // PUT /api/doc/:id
      if (req.method === "PUT") {
        if (!storage.docExists(docName)) {
          return jsonResponse({ error: "Document file not found" }, 404);
        }
        const body = await req.json();
        const { content } = body as { content: string };
        storage.setDocContent(docName, content);
        const putMeta = storage.getMetadata();
        if (putMeta.docs[docId]) {
          putMeta.docs[docId].updatedAt = new Date().toISOString();
          storage.setMetadata(putMeta);
        }
        return jsonResponse({ ok: true });
      }

      // DELETE /api/doc/:id?ifEmpty
      if (req.method === "DELETE" && url.searchParams.has("ifEmpty")) {
        const content = storage.getDocContent(docName) ?? "";
        const meta = storage.getMetadata();
        const hasSession = !!(
          meta.docs[docId]?.sessions && meta.docs[docId].sessions.length > 0
        );
        if (content.trim() !== "" || hasSession) {
          return jsonResponse({ deleted: false });
        }
        storage.deleteDoc(docName);
        const freshMeta = storage.getMetadata();
        delete freshMeta.docs[docId];
        if (freshMeta.lastOpenedDoc === docId) {
          delete freshMeta.lastOpenedDoc;
        }
        storage.setMetadata(freshMeta);
        return jsonResponse({ deleted: true });
      }

      // DELETE /api/doc/:id
      if (req.method === "DELETE") {
        storage.deleteDoc(docName);
        const freshMeta = storage.getMetadata();
        delete freshMeta.docs[docId];
        if (freshMeta.lastOpenedDoc === docId) {
          delete freshMeta.lastOpenedDoc;
        }
        storage.setMetadata(freshMeta);
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
console.log(
  `Doku running at ${serverUrl}${isPlayground ? " (playground mode)" : ""}`,
);

function cleanup() {
  storage.dispose();
}
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

if (HAS_EMBEDDED_ASSETS || !isDev) {
  if (process.platform === "darwin") {
    Bun.spawn(["open", serverUrl]);
  } else if (process.platform === "win32") {
    Bun.spawn(["cmd", "/c", "start", "", serverUrl]);
  } else {
    Bun.spawn(["xdg-open", serverUrl]);
  }
}
