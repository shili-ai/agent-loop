import { FolderOpenOutlined } from "@ant-design/icons";
import { Empty, Flex, List, Spin } from "antd";
import { pendingClarification } from "../../lib/clarification";
import type { AgentConversation, AgentMessage, AgentProject, AgentRun } from "../../types/agent";
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
  sending: boolean;
  onChangeMessage: (message: string) => void;
  onSend: () => void;
  onClarify: (text: string) => void;
  onDelete: () => void;
};

export default function AgentChatPanel({
  activeProject,
  conversation,
  draft,
  disabled,
  latestRun,
  loading,
  message,
  sending,
  onChangeMessage,
  onSend,
  onClarify,
  onDelete,
}: AgentChatPanelProps) {
  const clarificationQuestions = pendingClarification(latestRun);
  const projectTitle = conversation?.project?.title ?? activeProject?.title;
  const currentTitle = conversation?.title || (draft ? "Đoạn chat mới" : "Trợ lý presales");

  return (
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
          <ConversationTools conversation={conversation} onDelete={onDelete} />
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
              sending={sending}
              onChange={onChangeMessage}
              onSend={onSend}
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
                      <InlineAgentRun finalAnswer={item.finalAnswer} pending={item.pending} run={item.run} />
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
            sending={sending}
            onChange={onChangeMessage}
            onSend={onSend}
          />
        </>
      )}
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
