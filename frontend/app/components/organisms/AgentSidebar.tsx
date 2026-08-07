import { AppstoreOutlined } from "@ant-design/icons";
import { Avatar, Flex, Layout, Typography } from "antd";
import type { AgentConversation, AgentConversationSummary, AgentProject } from "../../types/agent";
import ConversationList from "../molecules/ConversationList";
import ProjectPanel from "../molecules/ProjectPanel";

type AgentSidebarProps = {
  activeConversation: AgentConversation | null;
  activeProject: AgentProject | null;
  conversations: AgentConversationSummary[];
  loading: boolean;
  projects: AgentProject[];
  onCreateConversation: () => void;
  onCreateProject: () => void;
  onDeleteConversation: (id: number) => void;
  onEditProject: () => void;
  onSelectProject: (id: number) => void;
  onSelectConversation: (id: number) => void;
};

export default function AgentSidebar({
  activeConversation,
  activeProject,
  conversations,
  loading,
  projects,
  onCreateConversation,
  onCreateProject,
  onDeleteConversation,
  onEditProject,
  onSelectProject,
  onSelectConversation,
}: AgentSidebarProps) {
  return (
    <Layout.Sider width={256} className="agent-sidebar" theme="light">
      <Flex vertical className="sidebar-layout">
        <div className="sidebar-brand">
          <Avatar shape="square" size={32} className="sidebar-logo">
            AI
          </Avatar>
          <div className="sidebar-brand-copy">
            <Typography.Text strong className="sidebar-brand-title">
              Presales AI Hub
            </Typography.Text>
            <Typography.Text type="secondary" className="sidebar-brand-subtitle">
              Agent workspace
            </Typography.Text>
          </div>
          <AppstoreOutlined className="sidebar-brand-menu" />
        </div>

        <div className="sidebar-scroll">
          <ProjectPanel
            activeProject={activeProject}
            loading={loading}
            projects={projects}
            onCreate={onCreateProject}
            onCreateChat={onCreateConversation}
            onEdit={onEditProject}
            onSelect={onSelectProject}
          />

          <ConversationList
            activeId={activeConversation?.id}
            conversations={conversations}
            loading={loading}
            onDelete={onDeleteConversation}
            onSelect={onSelectConversation}
          />
        </div>

        <div className="sidebar-footer">
          <Avatar size={30} className="sidebar-user-avatar">
            AI
          </Avatar>
          <div className="sidebar-footer-copy">
            <Typography.Text strong ellipsis className="sidebar-footer-title">
              Local workspace
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis className="sidebar-footer-subtitle">
              Project context enabled
            </Typography.Text>
          </div>
        </div>
      </Flex>
    </Layout.Sider>
  );
}
