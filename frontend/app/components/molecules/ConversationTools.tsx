"use client";

import {
  DownloadOutlined,
  EditOutlined,
  EllipsisOutlined,
  FileTextOutlined,
  GlobalOutlined,
  PartitionOutlined,
  PlusOutlined,
  ProfileOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Dropdown, Modal, Popover, Tooltip } from "antd";
import { useMemo, useState } from "react";
import type { AgentConversation } from "../../types/agent";

type ConversationToolsProps = {
  conversation: AgentConversation | null;
  onDelete?: () => void;
};

type DownloadFile = {
  name: string;
  content: string;
  mime: string;
};

type Source = {
  key: string;
  kind: "document" | "web" | "artifact" | "flow";
  title: string;
  detail?: string;
  file?: DownloadFile;
};

export default function ConversationTools({ conversation, onDelete }: ConversationToolsProps) {
  const [open, setOpen] = useState(false);
  const sources = useMemo(() => (conversation ? collectSources(conversation) : []), [conversation]);
  const answer = useMemo(() => (conversation ? latestAnswer(conversation) : ""), [conversation]);

  if (!conversation) return null;

  function downloadAnswer() {
    if (!answer || !conversation) return;
    triggerDownload({
      name: `${slugify(conversation.title) || "ket-qua"}.md`,
      content: answer,
      mime: "text/markdown;charset=utf-8",
    });
  }

  function handleCreateFile() {
    downloadAnswer();
    setOpen(false);
  }

  async function handleShare() {
    if (!conversation) return;
    const url = `${window.location.origin}/chat/${conversation.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard unavailable */
    }
  }

  const panelContent = (
    <div className="output-panel">
      <div className="output-panel-section">
        <div className="output-panel-title">Đầu ra</div>
        <button type="button" className="output-panel-item" onClick={handleCreateFile} disabled={!answer}>
          <span className="output-panel-item-icon">
            <PlusOutlined />
          </span>
          <span className="output-panel-item-text">
            <span className="output-panel-item-name">Tạo tệp hoặc trang web</span>
          </span>
        </button>
      </div>

      <div className="output-panel-divider" />

      <div className="output-panel-section">
        <div className="output-panel-title">Nguồn</div>
        {sources.length ? (
          sources.map((source) =>
            source.file ? (
              <button
                type="button"
                className="output-panel-item"
                key={source.key}
                title="Tải xuống tệp"
                onClick={() => {
                  triggerDownload(source.file as DownloadFile);
                  setOpen(false);
                }}
              >
                <span className="output-panel-item-icon">{sourceIcon(source.kind)}</span>
                <span className="output-panel-item-text">
                  <span className="output-panel-item-name">{source.title}</span>
                  {source.detail ? <span className="output-panel-item-detail">{source.detail}</span> : null}
                </span>
                <DownloadOutlined className="output-panel-item-action" />
              </button>
            ) : (
              <div className="output-panel-item static" key={source.key}>
                <span className="output-panel-item-icon">{sourceIcon(source.kind)}</span>
                <span className="output-panel-item-text">
                  <span className="output-panel-item-name">{source.title}</span>
                  {source.detail ? <span className="output-panel-item-detail">{source.detail}</span> : null}
                </span>
              </div>
            )
          )
        ) : (
          <div className="output-panel-empty">Chưa có nguồn nào cho hội thoại này.</div>
        )}
      </div>
    </div>
  );

  function confirmDelete() {
    if (!onDelete || !conversation) return;
    Modal.confirm({
      title: "Xoá đoạn chat?",
      content: `Đoạn chat "${conversation.title}" sẽ bị xoá vĩnh viễn và không thể khôi phục.`,
      okText: "Xoá",
      okButtonProps: { danger: true },
      cancelText: "Huỷ",
      onOk: onDelete,
    });
  }

  const moreMenu = {
    items: [
      { key: "copy", label: "Sao chép câu trả lời", disabled: !answer },
      { key: "download", label: "Tải xuống .md", disabled: !answer },
      ...(onDelete
        ? [{ type: "divider" as const }, { key: "delete", label: "Xoá đoạn chat", danger: true }]
        : []),
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "copy" && answer) navigator.clipboard.writeText(answer).catch(() => {});
      if (key === "download") downloadAnswer();
      if (key === "delete") confirmDelete();
    },
  };

  return (
    <div className="chat-header-tools">
      <Tooltip title="Sao chép liên kết chia sẻ">
        <button type="button" className="chat-tool-btn" onClick={handleShare} aria-label="Chia sẻ">
          <UploadOutlined />
        </button>
      </Tooltip>
      <Dropdown menu={moreMenu} trigger={["click"]} placement="bottomRight">
        <button type="button" className="chat-tool-btn" aria-label="Thêm">
          <EllipsisOutlined />
        </button>
      </Dropdown>
      <Popover
        content={panelContent}
        trigger="click"
        placement="bottomRight"
        open={open}
        onOpenChange={setOpen}
        rootClassName="output-popover"
      >
        <Tooltip title="Đầu ra & nguồn">
          <button type="button" className={open ? "chat-tool-btn active" : "chat-tool-btn"} aria-label="Đầu ra">
            <ProfileOutlined />
          </button>
        </Tooltip>
      </Popover>
    </div>
  );
}

function sourceIcon(kind: Source["kind"]) {
  if (kind === "web") return <GlobalOutlined />;
  if (kind === "artifact") return <EditOutlined />;
  if (kind === "flow") return <PartitionOutlined />;
  return <FileTextOutlined />;
}

function triggerDownload(file: DownloadFile) {
  const blob = new Blob([file.content], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function collectSources(conversation: AgentConversation): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();

  const push = (kind: Source["kind"], title: string, detail?: string, file?: DownloadFile) => {
    const clean = title.trim();
    if (!clean) return;
    const dedupeKey = `${kind}:${clean}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    sources.push({ key: dedupeKey, kind, title: clean, detail, file });
  };

  let flowIndex = 0;

  conversation.runs.forEach((run) => {
    run.steps.forEach((step) => {
      const data = step.data ?? {};

      asArray(data.documents).forEach((document) => {
        const item = asRecord(document);
        push("document", asString(item.title), asString(item.type) || undefined);
      });

      asArray(data.web_results).forEach((result) => {
        const item = asRecord(result);
        push("web", asString(item.title), asString(item.source) || asString(item.url) || undefined);
      });

      const artifact = asRecord(data.artifact);
      const artifactTitle = asString(artifact.title);
      if (artifactTitle) {
        const bullets = asArray(artifact.bullets);
        push("artifact", artifactTitle, bullets.length ? `Bản nháp · ${bullets.length} ý` : "Bản nháp");
      }

      if (step.kind === "flow") {
        const diagram = asString(data.diagram);
        if (diagram) {
          flowIndex += 1;
          const suffix = flowIndex > 1 ? `-${flowIndex}` : "";
          push("flow", `Sơ đồ luồng${flowIndex > 1 ? ` ${flowIndex}` : ""}`, "Mermaid · .md", {
            name: `so-do-luong${suffix}.md`,
            content: `\`\`\`mermaid\n${diagram.trim()}\n\`\`\`\n`,
            mime: "text/markdown;charset=utf-8",
          });
        }
      }
    });
  });

  return sources;
}

function latestAnswer(conversation: AgentConversation): string {
  const assistantMessage = [...conversation.messages].reverse().find((message) => message.role === "assistant");
  if (assistantMessage?.content) return assistantMessage.content;

  const answerStep = [...conversation.runs]
    .reverse()
    .flatMap((run) => run.steps)
    .find((step) => step.kind === "answer");
  const output = answerStep?.data?.output;
  return typeof output === "string" ? output : "";
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
