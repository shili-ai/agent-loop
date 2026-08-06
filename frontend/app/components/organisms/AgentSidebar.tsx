import { Flex, Layout, Typography } from "antd";
import type { AgentConversation, AgentConversationSummary } from "../../types/agent";
import ConversationList from "../molecules/ConversationList";
import WorkspaceCard from "../molecules/WorkspaceCard";

type AgentSidebarProps = {
  activeConversation: AgentConversation | null;
  conversations: AgentConversationSummary[];
  loading: boolean;
  onCreateConversation: () => void;
  onDeleteConversation: (id: number) => void;
  onSelectConversation: (id: number) => void;
};

export default function AgentSidebar({
  activeConversation,
  conversations,
  loading,
  onCreateConversation,
  onDeleteConversation,
  onSelectConversation,
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
          onDelete={onDeleteConversation}
          onSelect={onSelectConversation}
        />
        <WorkspaceCard conversation={activeConversation} />
      </Flex>
    </Layout.Sider>
  );
}
