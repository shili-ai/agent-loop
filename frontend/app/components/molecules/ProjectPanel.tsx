"use client";

import { Typography } from "antd";
import type { AgentConversationSummary, AgentProject } from "../../types/agent";

type ProjectPanelProps = {
  activeConversationId?: number;
  activeProject: AgentProject | null;
  activeProjectConversations: AgentConversationSummary[];
  conversations: AgentConversationSummary[];
  loading: boolean;
  projects: AgentProject[];
  onSelect: (id: number) => void;
  onSelectConversation: (id: number) => void;
};

export default function ProjectPanel({
  activeConversationId,
  activeProject,
  activeProjectConversations,
  conversations,
  loading,
  projects,
  onSelect,
  onSelectConversation,
}: ProjectPanelProps) {
  return (
    <section className="sidebar-section project-tree-section">
      <div className="project-tree">
        {projects.map((project) => {
          const active = project.id === activeProject?.id;
          const projectConversations =
            active && activeProjectConversations.length
              ? activeProjectConversations
              : conversations.filter((conversation) => conversation.agent_project_id === project.id);

          return (
            <div className="project-tree-group" key={project.id}>
              <div
                className={active ? "project-tree-row active" : "project-tree-row"}
                onClick={() => onSelect(project.id)}
                title="Mở màn hình project"
              >
                <Typography.Text ellipsis className="project-tree-title">
                  {project.title}
                </Typography.Text>
              </div>

              <div className="project-chat-tree">
                {projectConversations.length ? (
                  projectConversations.map((conversation) => (
                    <div
                      className={
                        conversation.id === activeConversationId
                          ? "project-chat-tree-row active"
                          : "project-chat-tree-row"
                      }
                      key={conversation.id}
                      onClick={() => onSelectConversation(conversation.id)}
                    >
                      <Typography.Text ellipsis className="project-chat-tree-title">
                        {conversation.title}
                      </Typography.Text>
                      {relativeTime(conversation.updated_at) ? (
                        <span className="project-chat-tree-time">{relativeTime(conversation.updated_at)}</span>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <Typography.Text type="secondary" className="project-chat-empty">
                    {loading ? "Đang tải" : "Chưa có đoạn chat"}
                  </Typography.Text>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function relativeTime(iso?: string) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diffMinutes = Math.floor((Date.now() - then) / 60000);
  if (diffMinutes < 1) return "vừa xong";
  if (diffMinutes < 60) return `${diffMinutes} phút`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} giờ`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} ngày`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} tháng`;

  return `${Math.floor(diffMonths / 12)} năm`;
}
