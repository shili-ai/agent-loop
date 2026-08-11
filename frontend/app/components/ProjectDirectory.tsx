"use client";

import { FolderOpenOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, ConfigProvider, Empty, Spin, Typography, theme } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createProject, listConversations, listProjects } from "../lib/agentApi";
import type { AgentConversationSummary, AgentProject, NewProjectInput } from "../types/agent";
import ErrorNotice from "./atoms/ErrorNotice";
import ProjectModal from "./molecules/ProjectModal";
import AgentSidebar from "./organisms/AgentSidebar";

export default function ProjectDirectory() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<AgentProject[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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

  async function handleCreateProject(input: NewProjectInput) {
    setSaving(true);
    setError(null);

    try {
      await createProject(input);
      setProjects(await listProjects());
      setModalOpen(false);
    } catch {
      setError("Không tạo được project. Kiểm tra Rails API.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProjectPageFrame>
      <div className="project-directory-page">
        <div className="project-directory-header">
          <div className="project-directory-heading">
            <FolderOpenOutlined className="project-directory-heading-icon" />
            <Typography.Title level={2} className="project-page-title">
              Projects
            </Typography.Title>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Tạo project
          </Button>
        </div>

        {error ? <ErrorNotice message={error} /> : null}

        {loading ? (
          <div className="project-page-loading">
            <Spin />
          </div>
        ) : projects.length ? (
          <div className="project-card-grid">
            {projects.map((project) => (
              <Link href={`/projects/${project.id}`} key={project.id} className="project-card">
                <div className="project-card-main">
                  <div className="project-card-title">{project.title}</div>
                  <div className="project-card-meta">
                    {[project.customer_name, project.industry].filter(Boolean).join(" · ") || "Project"}
                  </div>
                </div>
                <div className="project-card-footer">
                  <span>{project.skills?.length || 0} skill</span>
                  <span>{project.documents?.length || 0} tài liệu</span>
                  <span>{formatDate(project.updated_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty description="Chưa có project" />
        )}
      </div>

      <ProjectModal
        mode="create"
        open={modalOpen}
        project={null}
        saving={saving}
        onCancel={() => setModalOpen(false)}
        onSubmit={handleCreateProject}
      />
    </ProjectPageFrame>
  );
}

function formatDate(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  } catch {
    return "";
  }
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
            'var(--font-be-vietnam), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
          onSelectProject={(id) => router.push(`/projects/${id}`)}
          onSelectConversation={(id) => router.push(`/chat/${id}`)}
        />
        <section className="project-page">{children}</section>
      </main>
    </ConfigProvider>
  );
}
