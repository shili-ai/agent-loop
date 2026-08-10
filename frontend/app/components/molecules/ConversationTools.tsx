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
import {
  collectConversationLibrary,
  slugify,
  triggerLibraryDownload,
  type LibraryItem,
} from "../../lib/conversationLibrary";
import type { AgentConversation } from "../../types/agent";

type ConversationToolsProps = {
  conversation: AgentConversation | null;
  onDelete?: () => void;
  onOpenLibraryItem?: (item: LibraryItem) => void;
};

export default function ConversationTools({ conversation, onDelete, onOpenLibraryItem }: ConversationToolsProps) {
  const [open, setOpen] = useState(false);
  const library = useMemo(() => (conversation ? collectConversationLibrary(conversation) : { outputs: [], sources: [] }), [conversation]);
  const answer = useMemo(() => (conversation ? latestAnswer(conversation) : ""), [conversation]);

  if (!conversation) return null;

  function downloadAnswer() {
    if (!answer || !conversation) return;
    triggerLibraryDownload({
      key: "latest-answer",
      kind: "artifact",
      title: conversation.title,
      name: `${slugify(conversation.title) || "ket-qua"}.md`,
      content: answer,
      mime: "text/markdown;charset=utf-8",
    });
  }

  function openLibraryItem(item: LibraryItem) {
    if (item.url && !item.content) {
      window.open(item.url, "_blank", "noopener,noreferrer");
    } else {
      onOpenLibraryItem?.(item);
    }
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
        {library.outputs.length ? (
          library.outputs.map((item) => (
            <LibraryPanelItem item={item} key={item.key} onDownload={triggerLibraryDownload} onOpen={openLibraryItem} />
          ))
        ) : (
          <button type="button" className="output-panel-item" onClick={downloadAnswer} disabled={!answer}>
            <span className="output-panel-item-icon">
              <PlusOutlined />
            </span>
            <span className="output-panel-item-text">
              <span className="output-panel-item-name">Tạo tệp hoặc trang web</span>
            </span>
          </button>
        )}
      </div>

      <div className="output-panel-divider" />

      <div className="output-panel-section">
        <div className="output-panel-title">Nguồn</div>
        {library.sources.length ? (
          library.sources.map((item) => (
            <LibraryPanelItem item={item} key={item.key} onDownload={triggerLibraryDownload} onOpen={openLibraryItem} />
          ))
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

function LibraryPanelItem({
  item,
  onDownload,
  onOpen,
}: {
  item: LibraryItem;
  onDownload: (item: LibraryItem) => void;
  onOpen: (item: LibraryItem) => void;
}) {
  return (
    <button type="button" className="output-panel-item" onClick={() => onOpen(item)}>
      <span className="output-panel-item-icon">{sourceIcon(item.kind)}</span>
      <span className="output-panel-item-text">
        <span className="output-panel-item-name">{item.title}</span>
        {item.detail ? <span className="output-panel-item-detail">{item.detail}</span> : null}
      </span>
      {item.content ? (
        <span
          className="output-panel-item-action"
          role="button"
          tabIndex={0}
          title="Tải xuống"
          onClick={(event) => {
            event.stopPropagation();
            onDownload(item);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            onDownload(item);
          }}
        >
          <DownloadOutlined />
        </span>
      ) : null}
    </button>
  );
}

function sourceIcon(kind: LibraryItem["kind"]) {
  if (kind === "web") return <GlobalOutlined />;
  if (kind === "artifact") return <EditOutlined />;
  if (kind === "flow") return <PartitionOutlined />;
  return <FileTextOutlined />;
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
