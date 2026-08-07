"use client";

import { List } from "antd";
import { useState } from "react";
import type { AgentMessage } from "../../types/agent";
import MarkdownContent from "../atoms/MarkdownContent";
import MessageActions from "../atoms/MessageActions";

type MessageBubbleProps = {
  message: AgentMessage;
};

const COLLAPSE_THRESHOLD = 360;

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [expanded, setExpanded] = useState(false);
  const collapsible = isUser && message.content.length > COLLAPSE_THRESHOLD;
  const showCollapsed = collapsible && !expanded;

  if (isUser) {
    return (
      <List.Item className="message-row user-message-row">
        <div className={showCollapsed ? "user-bubble is-collapsed" : "user-bubble"}>
          <div className="user-bubble-text">{message.content}</div>
          {collapsible ? (
            <button type="button" className="bubble-toggle" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "Thu gọn" : "Xem thêm"}
            </button>
          ) : null}
        </div>
      </List.Item>
    );
  }

  return (
    <List.Item className="message-row assistant-message-row">
      <div className="assistant-message">
        <MarkdownContent className="markdown-content message-content">{message.content}</MarkdownContent>
        <MessageActions content={message.content} />
      </div>
    </List.Item>
  );
}
