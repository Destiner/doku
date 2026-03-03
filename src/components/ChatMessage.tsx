import { useState } from "react";
import type {
  ChatMessage as ChatMessageType,
  MessageSegment,
} from "../hooks/useChat";
import { MarkdownContent } from "./MarkdownContent";
import { AskUserBlock } from "./AskUserBlock";
import styles from "./ChatMessage.module.css";

interface Props {
  message: ChatMessageType;
  onSubmitAnswers?: (answers: Record<string, string>) => void;
}

function ToolCallsBlock({
  segment,
}: {
  segment: Extract<MessageSegment, { type: "toolCalls" }>;
}) {
  const [collapsed, setCollapsed] = useState(segment.collapsed);
  const isSingle = segment.calls.length === 1;

  if (isSingle) {
    const call = segment.calls[0];
    return (
      <div className={styles.toolCallsWrapper}>
        <div className={styles.toolCall}>
          <strong>{call.label}</strong>
          {call.detail ? ` ${call.detail}` : ""}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.toolCallsWrapper}>
      {segment.summary && (
        <div
          className={styles.toolSummary}
          onClick={() => setCollapsed((c) => !c)}
        >
          <i
            className={`ph ph-caret-right ${styles.caretIcon} ${!collapsed ? styles.caretExpanded : ""}`}
          />
          {segment.summary}
        </div>
      )}
      {!collapsed && (
        <div>
          {segment.calls.map((call, i) => (
            <div key={i} className={styles.toolCall}>
              <strong>{call.label}</strong>
              {call.detail ? ` ${call.detail}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatMessage({ message, onSubmitAnswers }: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}
    >
      <div
        className={`${styles.label} ${isUser ? styles.userLabel : styles.assistantLabel}`}
      >
        {isUser ? "You" : "Claude Code"}
      </div>
      {message.segments.map((segment, i) => {
        if (segment.type === "text") {
          if (!segment.content) return null;
          return isUser ? (
            <div key={i} className={styles.content}>
              {segment.content}
            </div>
          ) : (
            <MarkdownContent key={i} content={segment.content} />
          );
        }
        if (segment.type === "askUser") {
          return (
            <AskUserBlock
              key={i}
              segment={segment}
              onSubmit={onSubmitAnswers || (() => {})}
            />
          );
        }
        return <ToolCallsBlock key={i} segment={segment} />;
      })}
      {message.interrupted && (
        <div className={styles.interruptedBadge}>Interrupted</div>
      )}
    </div>
  );
}
