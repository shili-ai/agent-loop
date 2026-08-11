import { CloseOutlined, CodeOutlined, DownloadOutlined, EyeOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { Empty, Flex, List, Spin, Tooltip } from "antd";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { pendingClarification } from "../../lib/clarification";
import { triggerLibraryDownload, type LibraryItem } from "../../lib/conversationLibrary";
import type { AgentConversation, AgentMessage, AgentProject, AgentRun } from "../../types/agent";
import MarkdownContent from "../atoms/MarkdownContent";
import ChatComposer from "../molecules/ChatComposer";
import ClarificationForm from "../molecules/ClarificationForm";
import ConversationTools from "../molecules/ConversationTools";
import InlineAgentRun from "../molecules/InlineAgentRun";
import MessageBubble from "../molecules/MessageBubble";

type AgentChatPanelProps = {
  activeProject: AgentProject | null;
  conversation: AgentConversation | null;
  draft: boolean;
  disabled: boolean;
  latestRun?: AgentRun;
  loading: boolean;
  message: string;
  model: string;
  modelOptions: string[];
  sending: boolean;
  uploadingDocument?: boolean;
  onChangeMessage: (message: string) => void;
  onChangeModel: (model: string) => void;
  onSend: () => void;
  onClarify: (text: string) => void;
  onDelete: () => void;
  onUploadDocument?: (file: File) => void;
};

export default function AgentChatPanel({
  activeProject,
  conversation,
  draft,
  disabled,
  latestRun,
  loading,
  message,
  model,
  modelOptions,
  sending,
  uploadingDocument = false,
  onChangeMessage,
  onChangeModel,
  onSend,
  onClarify,
  onDelete,
  onUploadDocument,
}: AgentChatPanelProps) {
  const clarificationQuestions = pendingClarification(latestRun);
  const projectTitle = conversation?.project?.title ?? activeProject?.title;
  const projectId = conversation?.project?.id ?? activeProject?.id;
  const currentTitle = conversation?.title || (draft ? "Đoạn chat mới" : "Trợ lý presales");
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [previewMode, setPreviewMode] = useState<"preview" | "raw">("preview");
  const [previewScope, setPreviewScope] = useState<string | null>(null);
  const currentScope = draft ? "draft" : conversation?.id ? `conversation:${conversation.id}` : null;
  const activePreviewItem = previewScope === currentScope ? previewItem : null;
  const chatItems = useMemo(() => (conversation ? buildChatItems(conversation, sending) : []), [conversation, sending]);
  const tocItems = useMemo(
    () => buildConversationToc(chatItems, projectTitle, currentTitle),
    [chatItems, currentTitle, projectTitle]
  );

  function openPreview(item: LibraryItem) {
    setPreviewMode("preview");
    setPreviewScope(currentScope);
    setPreviewItem(item);
  }

  return (
    <div className={activePreviewItem ? "chat-workspace has-library-preview" : "chat-workspace"}>
      <div className="chat-column">
        <Flex justify="space-between" align="center" className="chat-header">
          <div className="chat-header-copy">
            <span className="chat-breadcrumb">
              {projectTitle ? (
                <>
                  <Link
                    className="chat-breadcrumb-project"
                    href={projectId ? `/projects/${projectId}` : "/projects"}
                    title="Quay lại project"
                  >
                    <FolderOpenOutlined />
                    {projectTitle}
                  </Link>
                  <span className="chat-breadcrumb-sep">/</span>
                </>
              ) : null}
              <span className="chat-breadcrumb-current">{currentTitle}</span>
            </span>
          </div>
          <div className="chat-header-right">
            <ConversationTools
              conversation={conversation}
              onDelete={onDelete}
              onOpenLibraryItem={openPreview}
            />
          </div>
        </Flex>

        {draft ? (
          <div className="chat-hero">
            <div className="chat-hero-inner">
              <h2 className="chat-hero-title">Bắt đầu đoạn chat mới</h2>
              <p className="chat-hero-subtitle">Nhập yêu cầu để trợ lý presales bắt đầu hỗ trợ bạn.</p>
              <ChatComposer
                disabled={disabled}
                message={message}
                model={model}
                modelOptions={modelOptions}
                sending={sending}
                uploadingDocument={uploadingDocument}
                onChange={onChangeMessage}
                onChangeModel={onChangeModel}
                onSend={onSend}
                onUploadDocument={onUploadDocument}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="messages-scroll">
              {loading ? (
                <Flex justify="center" align="center" className="empty-state">
                  <Spin />
                </Flex>
              ) : conversation?.messages.length ? (
                <>
                  {tocItems.length >= 2 ? <ChatTocRail items={tocItems} /> : null}
                  <div className="chat-thread">
                  <List
                    split={false}
                    dataSource={chatItems}
                    renderItem={(item) =>
                      (
                        <div id={anchorForChatItem(item)} className="chat-anchor">
                          {item.type === "message" ? (
                            <MessageBubble message={item.message} />
                          ) : (
                            <InlineAgentRun
                              finalAnswer={item.finalAnswer}
                              pending={item.pending}
                              run={item.run}
                              onOpenLibraryItem={openPreview}
                            />
                          )}
                        </div>
                      )
                    }
                  />
                  </div>
                </>
              ) : (
                <Flex justify="center" align="center" className="empty-state">
                  <Empty description={conversation ? "Gửi tin nhắn đầu tiên để chạy agent loop" : "Chọn hoặc tạo đoạn chat mới"} />
                </Flex>
              )}
            </div>

            {clarificationQuestions.length > 0 ? (
              <div className="clarification-dock">
                <ClarificationForm questions={clarificationQuestions} disabled={disabled} onSubmit={onClarify} />
              </div>
            ) : null}

            <ChatComposer
              disabled={disabled}
              message={message}
              model={model}
              modelOptions={modelOptions}
              sending={sending}
              uploadingDocument={uploadingDocument}
              onChange={onChangeMessage}
              onChangeModel={onChangeModel}
              onSend={onSend}
              onUploadDocument={onUploadDocument}
            />
          </>
        )}
      </div>

      {activePreviewItem ? (
        <aside className="library-preview-panel">
          <div className="library-preview-header">
            <div className="library-preview-title">
              <span className="library-preview-breadcrumb">Thư viện /</span>
              <span>{activePreviewItem.name || activePreviewItem.title}</span>
            </div>
            {activePreviewItem.content ? (
              <div className="library-preview-tabs" aria-label="Chế độ xem tài liệu">
                <button
                  type="button"
                  className={previewMode === "preview" ? "library-preview-tab active" : "library-preview-tab"}
                  aria-label="Xem trước"
                  onClick={() => setPreviewMode("preview")}
                >
                  <Tooltip title="Xem trước">
                    <EyeOutlined />
                  </Tooltip>
                </button>
                <button
                  type="button"
                  className={previewMode === "raw" ? "library-preview-tab active" : "library-preview-tab"}
                  aria-label="Nội dung gốc"
                  onClick={() => setPreviewMode("raw")}
                >
                  <Tooltip title="Nội dung gốc">
                    <CodeOutlined />
                  </Tooltip>
                </button>
              </div>
            ) : null}
            <div className="library-preview-actions">
              {activePreviewItem.content ? (
                <button type="button" className="chat-tool-btn" aria-label="Tải xuống" onClick={() => triggerLibraryDownload(activePreviewItem)}>
                  <DownloadOutlined />
                </button>
              ) : null}
              <button type="button" className="chat-tool-btn" aria-label="Đóng xem trước" onClick={() => setPreviewItem(null)}>
                <CloseOutlined />
              </button>
            </div>
          </div>
          <div className="library-preview-body">
            {activePreviewItem.content ? (
              previewMode === "preview" ? (
                <LibraryPreviewContent item={activePreviewItem} />
              ) : (
                <pre className="library-preview-raw">{activePreviewItem.content}</pre>
              )
            ) : (
              <div className="library-preview-empty">Không có nội dung xem trước cho mục này.</div>
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function ChatTocRail({ items }: { items: ChatTocItem[] }) {
  const [activeAnchor, setActiveAnchor] = useState(items[0]?.anchor);

  useEffect(() => {
    const container = document.querySelector<HTMLElement>(".messages-scroll");
    if (!container) return undefined;
    const scrollContainer = container;
    const animationFrame = window.requestAnimationFrame(updateActiveAnchor);

    function updateActiveAnchor() {
      const containerTop = scrollContainer.getBoundingClientRect().top;
      const threshold = containerTop + 120;
      let nextAnchor = items[0]?.anchor;

      items.forEach((item) => {
        const element = document.getElementById(item.anchor);
        if (!element) return;
        if (element.getBoundingClientRect().top <= threshold) {
          nextAnchor = item.anchor;
        }
      });

      setActiveAnchor(nextAnchor);
    }

    scrollContainer.addEventListener("scroll", updateActiveAnchor, { passive: true });
    window.addEventListener("resize", updateActiveAnchor);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      scrollContainer.removeEventListener("scroll", updateActiveAnchor);
      window.removeEventListener("resize", updateActiveAnchor);
    };
  }, [items]);

  function jumpTo(anchor: string) {
    setActiveAnchor(anchor);
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav className="chat-toc-rail" aria-label="Mục lục đoạn chat">
      <div className="chat-toc-track" />
      <div className="chat-toc-items">
        {items.map((item, index) => (
          <button
            type="button"
            key={item.anchor}
            className={`chat-toc-marker ${item.tone}${item.anchor === activeAnchor ? " active" : ""}`}
            aria-label={`Tới mục ${index + 1}: ${item.title}`}
            onClick={() => jumpTo(item.anchor)}
          >
            <span className="chat-toc-card">
              <span className="chat-toc-card-title">{item.title}</span>
              <span className="chat-toc-card-meta">{item.meta}</span>
              <span className="chat-toc-card-path">{item.path}</span>
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function LibraryPreviewContent({ item }: { item: LibraryItem }) {
  if (isCsvItem(item)) return <CsvPreview content={item.content || ""} />;

  return <MarkdownContent className="markdown-content library-preview-markdown">{item.content || ""}</MarkdownContent>;
}

function CsvPreview({ content }: { content: string }) {
  const rows = parseCsv(content);
  if (!rows.length) return <div className="library-preview-empty">Không có dữ liệu CSV để xem trước.</div>;

  const [header, ...body] = rows;
  return (
    <div className="library-preview-csv">
      <table>
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th key={`${cell}-${index}`}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {header.map((_, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`}>{row[cellIndex] || ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isCsvItem(item: LibraryItem) {
  return item.mime?.includes("csv") || item.name?.toLowerCase().endsWith(".csv") || item.title.toLowerCase().endsWith(".csv");
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

type ChatItem =
  | { key: string; type: "message"; message: AgentMessage }
  | { key: string; type: "run"; finalAnswer?: AgentMessage; pending?: boolean; run?: AgentRun };

type ChatTocItem = {
  anchor: string;
  title: string;
  meta: string;
  path: string;
  tone: "user" | "assistant" | "run";
};

function buildChatItems(conversation: AgentConversation, sending: boolean): ChatItem[] {
  const runsByUserMessageId = new Map(conversation.runs.map((run) => [run.user_message_id, run]));
  const messagesById = new Map(conversation.messages.map((message) => [message.id, message]));
  const assistantMessageIdsInRuns = new Set(
    conversation.runs
      .map((run) => run.assistant_message_id)
      .filter((id): id is number => typeof id === "number")
  );
  const items: ChatItem[] = [];

  conversation.messages.forEach((message) => {
    if (message.role === "assistant" && assistantMessageIdsInRuns.has(message.id)) return;

    items.push({ key: `message-${message.id}`, type: "message", message });

    if (message.role !== "user") return;

    const run = runsByUserMessageId.get(message.id);
    if (run) {
      items.push({
        key: `run-${run.id}`,
        type: "run",
        finalAnswer: run.assistant_message_id ? messagesById.get(run.assistant_message_id) : undefined,
        run,
      });
      return;
    }

    const isLatestMessage = conversation.messages.at(-1)?.id === message.id;
    if (sending && isLatestMessage) {
      items.push({ key: "pending-run", type: "run", pending: true });
    }
  });

  return items;
}

function buildConversationToc(items: ChatItem[], projectTitle?: string, chatTitle?: string): ChatTocItem[] {
  return items.map((item, index) => {
    if (item.type === "message") {
      const isUser = item.message.role === "user";
      return {
        anchor: anchorForChatItem(item),
        title: truncateTocTitle(item.message.content || (isUser ? "Tin nhắn người dùng" : "Phản hồi")),
        meta: isUser ? "Bạn đã hỏi" : "Trợ lý đã trả lời",
        path: [projectTitle, chatTitle].filter(Boolean).join(" / "),
        tone: isUser ? "user" : "assistant",
      };
    }

    const status = item.pending ? "Đang chạy" : item.run?.status === "completed" ? "Đã xử lý" : item.run?.status || "Agent run";
    const finalAnswer = item.finalAnswer?.content || answerFromRunForToc(item.run);
    return {
      anchor: anchorForChatItem(item),
      title: truncateTocTitle(finalAnswer || `Bước xử lý #${index + 1}`),
      meta: status,
      path: [projectTitle, chatTitle].filter(Boolean).join(" / "),
      tone: "run",
    };
  });
}

function anchorForChatItem(item: ChatItem) {
  return item.type === "message" ? `chat-message-${item.message.id}` : `chat-run-${item.run?.id || "pending"}`;
}

function answerFromRunForToc(run?: AgentRun) {
  const answerStep = run?.steps.find((step) => step.kind === "answer");
  const output = answerStep?.data.output;
  return typeof output === "string" ? output : undefined;
}

function truncateTocTitle(value: string, limit = 72) {
  const text = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`|>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text || "Không có nội dung";
}
