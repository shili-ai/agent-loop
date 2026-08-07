"use client";

import { CheckOutlined, CopyOutlined } from "@ant-design/icons";
import { useState } from "react";

type CodeBlockProps = {
  code: string;
  language?: string;
};

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">
          <span className="code-block-lang-icon">{"</>"}</span>
          {language || "text"}
        </span>
        <button type="button" className="code-block-copy" onClick={handleCopy}>
          {copied ? <CheckOutlined /> : <CopyOutlined />}
          {copied ? "Đã sao chép" : "Sao chép"}
        </button>
      </div>
      <pre className="code-block-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}
