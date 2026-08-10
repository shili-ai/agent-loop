"use client";

import {
  AudioOutlined,
  EditOutlined,
  LockOutlined,
  PlusOutlined,
  PushpinOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import { Button, Empty, Input, List, Segmented, Select, Space, Spin, Typography } from "antd";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createConversation,
  getProject,
  listConversations,
  sendConversationMessage,
  updateProject,
  uploadProjectDocument,
} from "../lib/agentApi";
import type { AgentConversationSummary, AgentProject, NewProjectInput } from "../types/agent";
import ErrorNotice from "./atoms/ErrorNotice";
import FileUploadButton from "./molecules/FileUploadButton";
import ProjectModal from "./molecules/ProjectModal";
import { ProjectPageFrame } from "./ProjectDirectory";

const MODEL_OPTIONS = ["llama3.2:3b", "llama3.1:8b"];

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = useMemo(() => Number(params.id), [params.id]);
  const [conversations, setConversations] = useState<AgentConversationSummary[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<AgentProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0]);
  const [starting, setStarting] = useState(false);
  const [taskMessage, setTaskMessage] = useState("");
  const [uploadingDocument, setUploadingDocument] = useState(false);

  useEffect(() => {
    async function loadProject() {
      if (!Number.isFinite(projectId)) return;

      setLoading(true);
      setError(null);

      try {
        const [loadedProject, loadedConversations] = await Promise.all([
          getProject(projectId),
          listConversations(projectId),
        ]);
        setProject(loadedProject);
        setConversations(loadedConversations);
      } catch {
        setError("Không tải được project. Kiểm tra Rails API.");
      } finally {
        setLoading(false);
      }
    }

    void loadProject();
  }, [projectId]);

  async function handleUpdateProject(input: NewProjectInput) {
    if (!project) return;

    setSaving(true);
    setError(null);

    try {
      setProject(await updateProject(project.id, input));
      setEditing(false);
    } catch {
      setError("Không lưu được project. Kiểm tra Rails API.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStartTask() {
    if (!project || !taskMessage.trim()) return;

    setStarting(true);
    setError(null);

    try {
      const created = await createConversation({
        title: taskMessage.trim().slice(0, 64),
        industry: project.industry,
        customer_name: project.customer_name ?? undefined,
        agent_project_id: project.id,
      });
      await sendConversationMessage(created.id, taskMessage.trim(), selectedModel);
      router.push(`/chat/${created.id}`);
    } catch {
      setError("Không tạo được task trong project. Kiểm tra Rails API.");
    } finally {
      setStarting(false);
    }
  }

  async function handleUploadProjectDocument(file: File) {
    if (!project || uploadingDocument) return;

    setUploadingDocument(true);
    setError(null);

    try {
      await uploadProjectDocument(project.id, file);
      setProject(await getProject(project.id));
    } catch {
      setError("Không tải được tài liệu vào project. Bản này hỗ trợ tốt file text/markdown/csv/json/html.");
    } finally {
      setUploadingDocument(false);
    }
  }

  return (
    <ProjectPageFrame activeProjectId={projectId}>
      {error ? <ErrorNotice message={error} /> : null}

      {loading ? (
        <div className="project-page-loading">
          <Spin />
        </div>
      ) : project ? (
        <div className="project-workspace">
          <div className="project-breadcrumb">
            <Link href="/projects">Projects</Link>
            <Typography.Text type="secondary">/</Typography.Text>
            <Typography.Text>{project.title}</Typography.Text>
          </div>

          <div className="project-workspace-header">
            <div>
              <Typography.Title level={2} className="project-workspace-title">
                {project.title}
              </Typography.Title>
              <Typography.Text type="secondary">
                {project.customer_name || "Presales AI Hub"} · Shared with your organization
              </Typography.Text>
            </div>
            <Space>
              <Button type="text" icon={<PushpinOutlined />} />
              <Button icon={<ShareAltOutlined />}>Share</Button>
            </Space>
          </div>

          <div className="project-workspace-grid">
            <main className="project-workspace-main">
              <section className="project-composer-card">
                <Input.TextArea
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  bordered={false}
                  placeholder="Write a message..."
                  value={taskMessage}
                  onChange={(event) => setTaskMessage(event.target.value)}
                  onPressEnter={(event) => {
                    if (!event.shiftKey) {
                      event.preventDefault();
                      void handleStartTask();
                    }
                  }}
                />
                <div className="project-composer-footer">
                  <Space>
                    <Button type="text" icon={<PlusOutlined />} />
                    <Segmented size="small" options={["Chat", "Cowork"]} defaultValue="Chat" />
                  </Space>
                  <Space>
                    <Select
                      size="small"
                      bordered={false}
                      value={selectedModel}
                      options={MODEL_OPTIONS.map((model) => ({ label: model, value: model }))}
                      onChange={setSelectedModel}
                    />
                    <Button type="text" icon={<AudioOutlined />} />
                    <Button type="primary" loading={starting} disabled={!taskMessage.trim()} onClick={handleStartTask}>
                      Start
                    </Button>
                  </Space>
                </div>
              </section>

              <div className="project-tabs-row">
                <Segmented options={["Chats and tasks", "Activity"]} defaultValue="Chats and tasks" />
                <Typography.Text type="secondary">
                  <LockOutlined /> All chats are private unless shared
                </Typography.Text>
              </div>

              <section className="project-task-list">
                {conversations.length ? (
                  <List
                    dataSource={conversations}
                    renderItem={(conversation) => (
                      <List.Item onClick={() => router.push(`/chat/${conversation.id}`)}>
                        <List.Item.Meta
                          title={conversation.title}
                          description={[conversation.customer_name, conversation.industry].filter(Boolean).join(" · ")}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Give the agent a task and it’ll pick up your project context automatically."
                    className="project-empty-state"
                  />
                )}
              </section>
            </main>

            <aside className="project-context-panel">
              <section>
                <div className="project-context-panel-header">
                  <Typography.Text strong>Instructions</Typography.Text>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(true)} />
                </div>
                <Typography.Paragraph type="secondary">
                  {project.shared_context || "Add instructions to tailor the agent responses."}
                </Typography.Paragraph>
              </section>
              <section>
                <div className="project-context-panel-header">
                  <Typography.Text strong>Memory</Typography.Text>
                  <Typography.Text type="secondary">
                    <LockOutlined /> Only you
                  </Typography.Text>
                </div>
                <Typography.Paragraph type="secondary">
                  {project.description || "Project memory will show here after a few chats."}
                </Typography.Paragraph>
              </section>
              <section>
                <div className="project-context-panel-header">
                  <Typography.Text strong>Tài liệu RAG</Typography.Text>
                  <FileUploadButton
                    className="project-upload-btn"
                    disabled={uploadingDocument}
                    title={uploadingDocument ? "Đang tải tài liệu" : "Thêm tài liệu vào project"}
                    onUpload={handleUploadProjectDocument}
                  />
                </div>
                {project.documents?.length ? (
                  <div className="rag-document-list">
                    {project.documents.map((document) => (
                      <div className="rag-document-item" key={document.id}>
                        <span className="rag-document-title">{document.title}</span>
                        <span className="rag-document-meta">
                          {document.extracted ? "Đã trích text" : "Chưa trích text"} · {formatBytes(document.byte_size)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Typography.Paragraph type="secondary">
                    Upload Markdown, text, CSV hoặc JSON để agent dùng làm nguồn RAG cho mọi chat trong project.
                  </Typography.Paragraph>
                )}
              </section>
              <section>
                <div className="project-context-panel-header">
                  <Typography.Text strong>Scheduled</Typography.Text>
                  <Button size="small" type="text" icon={<PlusOutlined />} />
                </div>
                <Typography.Paragraph type="secondary">Set up recurring tasks for this project.</Typography.Paragraph>
              </section>
            </aside>
          </div>
        </div>
      ) : (
        <Empty description="Không tìm thấy project" />
      )}

      <ProjectModal
        mode="edit"
        open={editing}
        project={project}
        saving={saving}
        onCancel={() => setEditing(false)}
        onSubmit={handleUpdateProject}
      />
    </ProjectPageFrame>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
