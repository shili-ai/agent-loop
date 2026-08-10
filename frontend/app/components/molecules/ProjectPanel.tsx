"use client";

import { RightOutlined } from "@ant-design/icons";
import { Typography } from "antd";
import Link from "next/link";
import { useState } from "react";
import type { AgentConversationSummary, AgentProject } from "../../types/agent";

const MAX_PROJECTS = 5;
const MAX_CHATS_PER_PROJECT = 5;

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
  const [toggled, setToggled] = useState<Record<number, boolean>>({});

  const looseConversations = conversations.filter((conversation) => conversation.agent_project_id == null);
  const shownProjects = projects.slice(0, MAX_PROJECTS);
  const extraProjects = projects.length - shownProjects.length;

  const isOpen = (id: number) => toggled[id] ?? id === activeProject?.id;
  const toggle = (id: number) => setToggled((prev) => ({ ...prev, [id]: !isOpen(id) }));

  const renderChatRow = (conversation: AgentConversationSummary) => (
    <div
      className={
        conversation.id === activeConversationId ? "project-chat-tree-row active" : "project-chat-tree-row"
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
  );

  return (
    <section className="sidebar-section project-tree-section">
      <div className="project-tree">
        {shownProjects.length ? <div className="sidebar-group-label">Projects</div> : null}

        {shownProjects.map((project) => {
          const active = project.id === activeProject?.id;
          const open = isOpen(project.id);
          const projectConversations =
            active && activeProjectConversations.length
              ? activeProjectConversations
              : conversations.filter((conversation) => conversation.agent_project_id === project.id);

          return (
            <div className="project-tree-group" key={project.id}>
              <button
                type="button"
                className={active ? "project-tree-row active" : "project-tree-row"}
                onClick={() => toggle(project.id)}
              >
                <RightOutlined className={open ? "project-tree-caret open" : "project-tree-caret"} />
                <Typography.Text ellipsis className="project-tree-title">
                  {project.title}
                </Typography.Text>
              </button>

              {open ? (
                <div className="project-chat-tree">
                  {projectConversations.length ? (
                    <>
                      {projectConversations.slice(0, MAX_CHATS_PER_PROJECT).map(renderChatRow)}
                      {projectConversations.length > MAX_CHATS_PER_PROJECT ? (
                        <button type="button" className="project-chat-more" onClick={() => onSelect(project.id)}>
                          Xem thêm đoạn chat…
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <Typography.Text type="secondary" className="project-chat-empty">
                      {loading ? "Đang tải" : "Chưa có đoạn chat"}
                    </Typography.Text>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}

        {extraProjects > 0 ? (
          <Link href="/projects" className="project-chat-more project-more-link">
            Xem thêm project…
          </Link>
        ) : null}

        {looseConversations.length ? (
          <div className="project-tree-group loose-group">
            <div className="sidebar-group-label">Đoạn chat</div>
            <div className="project-chat-tree loose">{looseConversations.map(renderChatRow)}</div>
          </div>
        ) : null}
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
