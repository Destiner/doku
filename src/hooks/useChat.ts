import { useState, useCallback, useEffect, useRef } from "react";
import { describeToolCall, generateToolSummary } from "../utils/toolCalls";

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

export interface AskUserQuestionSegment {
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

export type MessageSegment =
  | TextSegment
  | ToolCallsSegment
  | AskUserQuestionSegment;

export interface ChatMessage {
  role: "user" | "assistant";
  segments: MessageSegment[];
  interrupted?: boolean;
}

interface StreamEvent {
  type: string;
  content_block?: { type: string; name?: string; id?: string };
  delta?: { type?: string; text?: string; partial_json?: string };
  message?: {
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
      id?: string;
    }>;
  };
  result?: Array<{ type: string; text?: string }>;
  session_id?: string;
  error?: unknown;
}

function extractText(event: StreamEvent): string {
  if (event.type === "content_block_delta") {
    return event.delta?.text || "";
  }
  if (event.type === "assistant" && event.message?.content) {
    return event.message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");
  }
  if (event.type === "result" && event.result) {
    return event.result
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");
  }
  return "";
}

export function useChat(
  docId: string | null,
  onTitleUpdate?: (docId: string, title: string) => void,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!docId) {
      setMessages([]);
      return;
    }

    async function loadHistory() {
      try {
        const res = await fetch(
          `/api/chat/${encodeURIComponent(docId!)}/history`,
        );
        const { messages: history } = (await res.json()) as {
          messages: ChatMessage[];
        };
        setMessages(history);
      } catch {
        setMessages([]);
      }
    }

    loadHistory();
  }, [docId]);

  const sendMessage = useCallback(
    async (prompt: string) => {
      if (!docId) return;
      const userMsg: ChatMessage = {
        role: "user",
        segments: [{ type: "text", content: prompt }],
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Mutable accumulator for streaming
      const segments: MessageSegment[] = [{ type: "text", content: "" }];
      const seenToolIds = new Set<string>();
      let currentToolName: string | null = null;
      let currentToolId: string | null = null;
      let toolInputBuffer = "";
      let hasStreamingDeltas = false;
      let currentToolCallsSegment: ToolCallsSegment | null = null;

      function flush() {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              segments: [...segments],
            };
          }
          return updated;
        });
      }

      function addToolCall(
        name: string,
        params: Record<string, unknown>,
        id?: string,
      ) {
        if (id && seenToolIds.has(id)) return;
        if (id) seenToolIds.add(id);
        const { label, detail } = describeToolCall(name, params);

        if (!currentToolCallsSegment) {
          currentToolCallsSegment = {
            type: "toolCalls",
            calls: [],
            collapsed: false,
            summary: "",
          };
          segments.push(currentToolCallsSegment);
        }
        currentToolCallsSegment.calls.push({ name, label, detail });
      }

      function finalizeToolCallsSegment() {
        if (currentToolCallsSegment) {
          currentToolCallsSegment.summary = generateToolSummary(
            currentToolCallsSegment.calls,
          );
          currentToolCallsSegment.collapsed = true;
        }
      }

      function startNewTextSegment() {
        finalizeToolCallsSegment();
        segments.push({ type: "text", content: "" });
        currentToolCallsSegment = null;
      }

      // Add initial assistant message
      const assistantMsg: ChatMessage = {
        role: "assistant",
        segments: [{ type: "text", content: "" }],
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, docId }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event: StreamEvent = JSON.parse(data);

              if (
                event.type === "title" &&
                (event as unknown as { title: string }).title
              ) {
                if (docId && onTitleUpdate) {
                  onTitleUpdate(
                    docId,
                    (event as unknown as { title: string }).title,
                  );
                }
                continue;
              }

              if (event.type === "ask_user") {
                const askEvent = event as unknown as {
                  type: "ask_user";
                  questions: AskUserQuestionSegment["questions"];
                };
                if (currentToolCallsSegment) {
                  startNewTextSegment();
                }
                segments.push({
                  type: "askUser",
                  questions: askEvent.questions,
                  answered: false,
                });
                flush();
                continue;
              }

              if (
                event.type === "content_block_start" &&
                event.content_block?.type === "tool_use"
              ) {
                currentToolName = event.content_block.name || null;
                currentToolId = event.content_block.id || null;
                toolInputBuffer = "";
                continue;
              }

              if (
                event.type === "content_block_delta" &&
                event.delta?.type === "input_json_delta"
              ) {
                toolInputBuffer += event.delta.partial_json || "";
                continue;
              }

              if (event.type === "content_block_stop" && currentToolName) {
                let params: Record<string, unknown> = {};
                try {
                  params = JSON.parse(toolInputBuffer);
                } catch {
                  // ignore parse errors
                }
                addToolCall(
                  currentToolName,
                  params,
                  currentToolId || undefined,
                );
                currentToolName = null;
                currentToolId = null;
                toolInputBuffer = "";
                flush();
                continue;
              }

              if (event.type === "assistant" && event.message?.content) {
                let addedTools = false;
                for (const block of event.message.content) {
                  if (block.type === "tool_use") {
                    addToolCall(block.name!, block.input || {}, block.id);
                    addedTools = true;
                  }
                }
                if (addedTools) flush();
              }

              const text = extractText(event);
              if (text) {
                if (event.type === "content_block_delta")
                  hasStreamingDeltas = true;
                if (hasStreamingDeltas && event.type !== "content_block_delta")
                  continue;

                if (currentToolCallsSegment) {
                  startNewTextSegment();
                }

                const lastSeg = segments[segments.length - 1];
                if (lastSeg.type === "text") {
                  lastSeg.content += text;
                }
                flush();
              }
            } catch {
              // skip non-JSON
            }
          }
        }

        // Finalize any remaining open tool calls block
        finalizeToolCallsSegment();

        // Handle empty response
        const hasText = segments.some(
          (s) => s.type === "text" && s.content.length > 0,
        );
        if (!hasText) {
          const firstText = segments.find((s) => s.type === "text") as
            | TextSegment
            | undefined;
          if (firstText) {
            firstText.content = "(no response)";
          }
        }

        flush();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Aborted by user — keep partial content as-is
          finalizeToolCallsSegment();
          flush();
        } else {
          const firstText = segments.find((s) => s.type === "text") as
            | TextSegment
            | undefined;
          if (firstText) {
            firstText.content = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
          flush();
        }
      } finally {
        abortControllerRef.current = null;
        setIsStreaming(false);

        // Drain queued messages
        setMessageQueue((queue) => {
          if (queue.length > 0) {
            const combined = queue.join("\n\n");
            // Schedule sendMessage on next tick to avoid state conflicts
            setTimeout(() => sendMessage(combined), 0);
            return [];
          }
          return queue;
        });
      }
    },
    [docId, onTitleUpdate],
  );

  const queueMessage = useCallback((prompt: string) => {
    setMessageQueue((prev) => [...prev, prompt]);
  }, []);

  const removeQueuedMessage = useCallback((index: number) => {
    setMessageQueue((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  }, []);

  const abortMessage = useCallback(async () => {
    if (!docId) return;

    // Kill server-side process
    try {
      await fetch("/api/chat/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId }),
      });
    } catch {
      // best-effort
    }

    // Abort client-side fetch
    abortControllerRef.current?.abort();

    // Mark last assistant message as interrupted
    setMessages((prev) => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === "assistant") {
          updated[i] = { ...updated[i], interrupted: true };
          break;
        }
      }
      return updated;
    });
  }, [docId]);

  const submitAnswers = useCallback(
    async (answers: Record<string, string>) => {
      if (!docId) return;
      await fetch("/api/chat/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, answers }),
      });

      setMessages((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          const msg = updated[i];
          if (msg.role !== "assistant") continue;
          for (let j = msg.segments.length - 1; j >= 0; j--) {
            const seg = msg.segments[j];
            if (seg.type === "askUser" && !seg.answered) {
              const newSegments = [...msg.segments];
              newSegments[j] = { ...seg, answered: true, answers };
              updated[i] = { ...msg, segments: newSegments };
              return updated;
            }
          }
        }
        return updated;
      });
    },
    [docId],
  );

  return {
    messages,
    setMessages,
    isStreaming,
    sendMessage,
    abortMessage,
    submitAnswers,
    queueMessage,
    removeQueuedMessage,
    messageQueue,
  };
}
