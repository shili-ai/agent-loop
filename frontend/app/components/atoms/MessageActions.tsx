"use client";

import {
  CheckOutlined,
  CopyOutlined,
  LikeOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useState } from "react";

type MessageActionsProps = {
  content: string;
  onRetry?: () => void;
};

export default function MessageActions({ content, onRetry }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="message-actions">
      <button type="button" className="message-action" title="Sao chép" onClick={handleCopy}>
        {copied ? <CheckOutlined /> : <CopyOutlined />}
      </button>
      <button type="button" className="message-action" title="Hữu ích">
        <LikeOutlined />
      </button>
      {onRetry ? (
        <button type="button" className="message-action" title="Tạo lại" onClick={onRetry}>
          <ReloadOutlined />
        </button>
      ) : null}
    </div>
  );
}
