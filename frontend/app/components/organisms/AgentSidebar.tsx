import { CloudOutlined, FolderOpenOutlined, FormOutlined, ToolOutlined } from "@ant-design/icons";
import { Avatar, Button, Flex, Layout, Typography } from "antd";
import Link from "next/link";
import type { AgentConversation, AgentConversationSummary, AgentProject } from "../../types/agent";
import ProjectPanel from "../molecules/ProjectPanel";

type AgentSidebarProps = {
  activeConversation: AgentConversation | null;
  activeProject: AgentProject | null;
  activeProjectConversations: AgentConversationSummary[];
  conversations: AgentConversationSummary[];
  loading: boolean;
  projects: AgentProject[];
  onCreateConversation: () => void;
  onSelectProject: (id: number) => void;
  onSelectConversation: (id: number) => void;
};

export default function AgentSidebar({
  activeConversation,
  activeProject,
  activeProjectConversations,
  conversations,
  loading,
  projects,
  onCreateConversation,
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
        </div>

        <div className="sidebar-actions">
          <Button block type="text" icon={<FormOutlined />} onClick={onCreateConversation}>
            Đoạn chat mới
          </Button>
          <Link href="/projects" className="sidebar-action-link">
            <Button block type="text" icon={<FolderOpenOutlined />}>
              Projects
            </Button>
          </Link>
          <Link href="/skills" className="sidebar-action-link">
            <Button block type="text" icon={<ToolOutlined />}>
              Skills & Prompts
            </Button>
          </Link>
          <Link href="/connectors" className="sidebar-action-link">
            <Button block type="text" icon={<CloudOutlined />}>
              Connectors
            </Button>
          </Link>
        </div>

        <div className="sidebar-scroll">
          <ProjectPanel
            activeConversationId={activeConversation?.id}
            activeProject={activeProject}
            activeProjectConversations={activeProjectConversations}
            conversations={conversations}
            loading={loading}
            projects={projects}
            onSelect={onSelectProject}
            onSelectConversation={onSelectConversation}
          />
        </div>
      </Flex>
    </Layout.Sider>
  );
}
