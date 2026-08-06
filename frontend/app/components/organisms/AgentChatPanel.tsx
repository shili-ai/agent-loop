import { Card, Empty, Flex, List, Spin, Typography } from "antd";
import { pendingClarification } from "../../lib/clarification";
import type { AgentConversation, AgentMessage, AgentRun } from "../../types/agent";
import RunStatusTag from "../atoms/RunStatusTag";
import ChatComposer from "../molecules/ChatComposer";
import ClarificationForm from "../molecules/ClarificationForm";
import InlineAgentRun from "../molecules/InlineAgentRun";
import MessageBubble from "../molecules/MessageBubble";

type AgentChatPanelProps = {
  conversation: AgentConversation | null;
  disabled: boolean;
  latestRun?: AgentRun;
  loading: boolean;
  message: string;
  sending: boolean;
  onChangeMessage: (message: string) => void;
  onSend: () => void;
  onClarify: (text: string) => void;
};

export default function AgentChatPanel({
  conversation,
  disabled,
  latestRun,
  loading,
  message,
  sending,
  onChangeMessage,
  onSend,
  onClarify,
}: AgentChatPanelProps) {
  const clarificationQuestions = pendingClarification(latestRun);

  return (
    <div className="chat-column">
      <Flex justify="space-between" align="center" className="chat-header">
        <div>
          <Typography.Title level={4}>Trợ lý presales</Typography.Title>
          <Typography.Text type="secondary">
            Tìm tài liệu, soạn proposal, battlecard, câu trả lời RFP hoặc email follow-up.
          </Typography.Text>
        </div>
        <RunStatusTag status={latestRun?.status} />
      </Flex>

      <Card className="messages-card">
        {loading ? (
          <Flex justify="center" align="center" className="empty-state">
            <Spin />
          </Flex>
        ) : conversation?.messages.length ? (
          <List
            dataSource={buildChatItems(conversation, sending)}
            renderItem={(item) =>
              item.type === "message" ? (
                <MessageBubble message={item.message} />
              ) : (
                <InlineAgentRun finalAnswer={item.finalAnswer} pending={item.pending} run={item.run} />
              )
            }
          />
        ) : (
          <Empty description={conversation ? "Gửi tin nhắn đầu tiên để chạy agent loop" : "Chọn hoặc tạo chat mới"} />
        )}
      </Card>

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
