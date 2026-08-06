import { Card, Empty, Flex, List, Spin, Typography } from "antd";
import type { AgentConversation, AgentRun } from "../../types/agent";
import RunStatusTag from "../atoms/RunStatusTag";
import ChatComposer from "../molecules/ChatComposer";
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
}: AgentChatPanelProps) {
  return (
    <div className="chat-column">
      <Flex justify="space-between" align="center" className="chat-header">
        <div>
          <Typography.Title level={4}>Agent chat</Typography.Title>
          <Typography.Text type="secondary">
            Ask for documents, proposal outlines, battlecards, RFP answers, or follow-up emails.
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
          <List dataSource={conversation.messages} renderItem={(item) => <MessageBubble message={item} />} />
        ) : (
          <Empty description={conversation ? "Gui message dau tien de chay agent loop" : "Chon hoac tao chat moi"} />
        )}
      </Card>

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
