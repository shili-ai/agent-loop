import { CloseOutlined, CodeOutlined, DownloadOutlined, EyeOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { Empty, Flex, List, Spin, Tooltip } from "antd";
import { useState } from "react";
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
  const currentTitle = conversation?.title || (draft ? "Đoạn chat mới" : "Trợ lý presales");
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [previewMode, setPreviewMode] = useState<"preview" | "markdown">("preview");
  const [previewScope, setPreviewScope] = useState<string | null>(null);
  const currentScope = draft ? "draft" : conversation?.id ? `conversation:${conversation.id}` : null;
  const activePreviewItem = previewScope === currentScope ? previewItem : null;

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
                  <span className="chat-breadcrumb-project">
                    <FolderOpenOutlined />
                    {projectTitle}
                  </span>
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
                <div className="chat-thread">
                  <List
                    split={false}
                    dataSource={buildChatItems(conversation, sending)}
                    renderItem={(item) =>
                      item.type === "message" ? (
                        <MessageBubble message={item.message} />
                      ) : (
                        <InlineAgentRun
                          finalAnswer={item.finalAnswer}
                          pending={item.pending}
                          run={item.run}
                          onOpenLibraryItem={openPreview}
                        />
                      )
                    }
                  />
                </div>
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
                  className={previewMode === "markdown" ? "library-preview-tab active" : "library-preview-tab"}
                  aria-label="Markdown"
                  onClick={() => setPreviewMode("markdown")}
                >
                  <Tooltip title="Markdown">
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
                <MarkdownContent className="markdown-content library-preview-markdown">{activePreviewItem.content}</MarkdownContent>
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

type ChatItem =
  | { key: string; type: "message"; message: AgentMessage }
  | { key: string; type: "run"; finalAnswer?: AgentMessage; pending?: boolean; run?: AgentRun };

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
