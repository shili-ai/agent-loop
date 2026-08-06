import { Flex, Layout, Typography } from "antd";
import type { AgentConversation, AgentConversationSummary } from "../../types/agent";
import ConversationList from "../molecules/ConversationList";
import QuickPrompts from "../molecules/QuickPrompts";
import WorkspaceCard from "../molecules/WorkspaceCard";

type AgentSidebarProps = {
  activeConversation: AgentConversation | null;
  conversations: AgentConversationSummary[];
  disabled: boolean;
  loading: boolean;
  onCreateConversation: () => void;
  onSelectConversation: (id: number) => void;
  onSelectPrompt: (prompt: string) => void;
};

export default function AgentSidebar({
  activeConversation,
  conversations,
  disabled,
  loading,
  onCreateConversation,
  onSelectConversation,
  onSelectPrompt,
}: AgentSidebarProps) {
  return (
    <Layout.Sider width={340} className="agent-sidebar" theme="light">
      <Flex vertical gap={18}>
        <div>
          <Typography.Title level={3} className="agent-title">
            Presales Agent
          </Typography.Title>
          <Typography.Text type="secondary">Rails agent loop with dummy tools</Typography.Text>
        </div>

        <ConversationList
          activeId={activeConversation?.id}
          conversations={conversations}
          loading={loading}
          onCreate={onCreateConversation}
          onSelect={onSelectConversation}
        />
        <WorkspaceCard conversation={activeConversation} />
        <QuickPrompts disabled={disabled} onSelect={onSelectPrompt} />
      </Flex>
    </Layout.Sider>
  );
}
