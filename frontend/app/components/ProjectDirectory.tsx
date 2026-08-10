"use client";

import { ArrowLeftOutlined, FolderAddOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { Button, ConfigProvider, Empty, List, Space, Spin, Typography, theme } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { listConversations, listProjects } from "../lib/agentApi";
import type { AgentConversationSummary, AgentProject } from "../types/agent";
import ErrorNotice from "./atoms/ErrorNotice";
import AgentSidebar from "./organisms/AgentSidebar";

export default function ProjectDirectory() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<AgentProject[]>([]);

  useEffect(() => {
    async function loadProjects() {
      setLoading(true);
      setError(null);

      try {
        setProjects(await listProjects());
      } catch {
        setError("Không tải được danh sách project. Kiểm tra Rails API.");
      } finally {
        setLoading(false);
      }
    }

    void loadProjects();
  }, []);

  return (
    <ProjectPageFrame>
      <div className="project-page-header">
        <Space direction="vertical" size={4}>
          <Typography.Text type="secondary" className="project-page-eyebrow">
            Presales AI Hub
          </Typography.Text>
          <Typography.Title level={2} className="project-page-title">
            Projects
          </Typography.Title>
          <Typography.Text type="secondary">Quản lý context dùng chung và các chat theo từng dự án.</Typography.Text>
        </Space>
        <Link href="/">
          <Button icon={<ArrowLeftOutlined />}>Về chat</Button>
        </Link>
      </div>

      {error ? <ErrorNotice message={error} /> : null}

      <section className="project-page-section">
        <div className="project-page-section-title">
          <FolderAddOutlined />
          <Typography.Text strong>Danh sách project</Typography.Text>
        </div>
        {loading ? (
          <div className="project-page-loading">
            <Spin />
          </div>
        ) : projects.length ? (
          <List
            className="project-directory-list"
            dataSource={projects}
            renderItem={(project) => (
              <List.Item
                actions={[
                  <Link href={`/projects/${project.id}`} key="open">
                    <Button type="link">Xem project</Button>
                  </Link>,
                ]}
              >
                <List.Item.Meta
                  avatar={<FolderOpenOutlined className="project-list-icon" />}
                  title={<Link href={`/projects/${project.id}`}>{project.title}</Link>}
                  description={
                    <Space direction="vertical" size={2}>
                      <Typography.Text type="secondary">
                        {[project.customer_name, project.industry].filter(Boolean).join(" · ")}
                      </Typography.Text>
                      <Typography.Text type="secondary" ellipsis>
                        {project.description || project.shared_context || "Chưa có mô tả/context."}
                      </Typography.Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="Chưa có project" />
        )}
      </section>
    </ProjectPageFrame>
  );
}

export function ProjectPageFrame({
  activeProjectId,
  children,
}: {
  activeProjectId?: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const [activeProjectConversations, setActiveProjectConversations] = useState<AgentConversationSummary[]>([]);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [sidebarConversations, setSidebarConversations] = useState<AgentConversationSummary[]>([]);
  const [sidebarProjects, setSidebarProjects] = useState<AgentProject[]>([]);
  const activeProject = sidebarProjects.find((project) => project.id === activeProjectId) ?? sidebarProjects[0] ?? null;

  useEffect(() => {
    async function loadSidebarProjects() {
      try {
        const projects = await listProjects();
        const activeSidebarProjectId = activeProjectId ?? projects[0]?.id;
        const [conversations, activeConversations] = await Promise.all([
          listConversations(),
          activeSidebarProjectId ? listConversations(activeSidebarProjectId) : Promise.resolve([]),
        ]);
        setSidebarProjects(projects);
        setSidebarConversations(conversations);
        setActiveProjectConversations(activeConversations);
      } finally {
        setSidebarLoading(false);
      }
    }

    void loadSidebarProjects();
  }, [activeProjectId]);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 8,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontSize: 13,
        },
      }}
    >
      <main className="project-shell">
        <AgentSidebar
          activeConversation={null}
          activeProject={activeProject}
          activeProjectConversations={activeProjectConversations}
          conversations={sidebarConversations}
          loading={sidebarLoading}
          projects={sidebarProjects}
          onCreateConversation={() => router.push("/")}
          onCreateProject={() => router.push("/projects")}
          onSelectProject={(id) => router.push(`/projects/${id}`)}
          onSelectConversation={(id) => router.push(`/chat/${id}`)}
        />
        <section className="project-page">{children}</section>
      </main>
    </ConfigProvider>
  );
}
