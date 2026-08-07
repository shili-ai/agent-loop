"use client";

import { EditOutlined, FolderAddOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Select, Space, Typography } from "antd";
import type { AgentProject } from "../../types/agent";

type ProjectPanelProps = {
  activeProject: AgentProject | null;
  loading: boolean;
  projects: AgentProject[];
  onCreate: () => void;
  onCreateChat: () => void;
  onEdit: () => void;
  onSelect: (id: number) => void;
};

export default function ProjectPanel({
  activeProject,
  loading,
  projects,
  onCreate,
  onCreateChat,
  onEdit,
  onSelect,
}: ProjectPanelProps) {
  return (
    <section className="sidebar-section">
      <div className="sidebar-section-header">
        <Typography.Text className="sidebar-section-title">Project</Typography.Text>
        <Space size={2}>
          <Button size="small" type="text" icon={<EditOutlined />} disabled={!activeProject} onClick={onEdit} />
          <Button size="small" type="text" icon={<FolderAddOutlined />} onClick={onCreate} />
        </Space>
      </div>
      <Space direction="vertical" size={8} className="full-width">
        <Select
          className="full-width"
          size="small"
          loading={loading}
          placeholder="Chọn project"
          value={activeProject?.id}
          options={projects.map((project) => ({ label: project.title, value: project.id }))}
          onChange={onSelect}
        />
        {activeProject ? (
          <div className="project-group-card">
            <div className="project-group-header">
              <div className="project-group-title">
                <Typography.Text strong ellipsis>
                  {activeProject.title}
                </Typography.Text>
                <Typography.Text type="secondary" ellipsis>
                  {activeProject.customer_name || activeProject.industry}
                </Typography.Text>
              </div>
              <Button size="small" type="text" icon={<PlusOutlined />} onClick={onCreateChat}>
                Chat
              </Button>
            </div>
            <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} className="project-context-preview">
              {activeProject.shared_context || "Chưa có context dùng chung."}
            </Typography.Paragraph>
          </div>
        ) : null}
      </Space>
    </section>
  );
}
