"use client";

import {
  DeleteOutlined,
  EditOutlined,
  LockOutlined,
  PlusOutlined,
  PushpinOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import { Button, Empty, List, Modal, Segmented, Select, Space, Spin, Typography } from "antd";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  assignProjectSkill,
  createConversation,
  getProject,
  listConversations,
  listSkills,
  removeProjectSkill,
  sendConversationMessage,
  updateProject,
  uploadProjectDocument,
} from "../lib/agentApi";
import type { AgentConversationSummary, AgentProject, AgentSkill, NewProjectInput } from "../types/agent";
import ErrorNotice from "./atoms/ErrorNotice";
import ChatComposer from "./molecules/ChatComposer";
import FileUploadButton from "./molecules/FileUploadButton";
import ProjectModal from "./molecules/ProjectModal";
import { ProjectPageFrame } from "./ProjectDirectory";

const MODEL_OPTIONS = [
  "llama3.2:3b",
  "llama3.1:8b",
  "qwen3:8b",
  "deepseek:deepseek-v4-flash",
  "deepseek:deepseek-v4-pro",
];

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
  const [skillCatalog, setSkillCatalog] = useState<AgentSkill[]>([]);
  const [skillMutationId, setSkillMutationId] = useState<number | null>(null);
  const [skillToAssign, setSkillToAssign] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0]);
  const [selectedSkill, setSelectedSkill] = useState<AgentSkill | null>(null);
  const [starting, setStarting] = useState(false);
  const [taskMessage, setTaskMessage] = useState("");
  const [uploadingDocument, setUploadingDocument] = useState(false);

  useEffect(() => {
    async function loadProject() {
      if (!Number.isFinite(projectId)) return;

      setLoading(true);
      setError(null);

      try {
        const [loadedProject, loadedConversations, loadedSkills] = await Promise.all([
          getProject(projectId),
          listConversations(projectId),
          listSkills(),
        ]);
        setProject(loadedProject);
        setConversations(loadedConversations);
        setSkillCatalog(loadedSkills);
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

  async function handleAssignSkill() {
    if (!project || !skillToAssign) return;

    setSkillMutationId(skillToAssign);
    setError(null);

    try {
      await assignProjectSkill(project.id, skillToAssign);
      setProject(await getProject(project.id));
      setSkillToAssign(null);
    } catch {
      setError("Không gán được skill vào project.");
    } finally {
      setSkillMutationId(null);
    }
  }

  async function handleRemoveSkill(skill: AgentSkill) {
    if (!project || !skill.assignment_id) return;

    setSkillMutationId(skill.id);
    setError(null);

    try {
      await removeProjectSkill(project.id, skill.assignment_id);
      setProject(await getProject(project.id));
    } catch {
      setError("Không xoá được skill khỏi project.");
    } finally {
      setSkillMutationId(null);
    }
  }

  const assignableSkills = useMemo(() => {
    const assignedSkillIds = new Set(project?.skills?.map((skill) => skill.id) ?? []);
    return skillCatalog.filter((skill) => skill.enabled && !assignedSkillIds.has(skill.id));
  }, [project?.skills, skillCatalog]);

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
              <div className="project-composer-standard">
                <ChatComposer
                  disabled={starting}
                  message={taskMessage}
                  model={selectedModel}
                  modelOptions={MODEL_OPTIONS}
                  sending={starting}
                  uploadingDocument={uploadingDocument}
                  onChange={setTaskMessage}
                  onChangeModel={setSelectedModel}
                  onSend={handleStartTask}
                  onUploadDocument={handleUploadProjectDocument}
                />
              </div>

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
                  <Typography.Text strong>Skills</Typography.Text>
                  <Space.Compact>
                    <Select
                      size="small"
                      className="project-skill-select"
                      placeholder="Thêm skill"
                      value={skillToAssign}
                      options={assignableSkills.map((skill) => ({ label: skill.name, value: skill.id }))}
                      onChange={setSkillToAssign}
                    />
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      loading={Boolean(skillToAssign && skillMutationId === skillToAssign)}
                      disabled={!skillToAssign}
                      onClick={handleAssignSkill}
                    />
                  </Space.Compact>
                </div>
                {project.skills?.length ? (
                  <div className="rag-document-list">
                    {project.skills.map((skill) => (
                      <div className="rag-document-item skill-project-item" key={`${skill.id}-${skill.assignment_id || "fallback"}`}>
                        <button className="skill-project-main" type="button" onClick={() => setSelectedSkill(skill)}>
                          <span className="rag-document-title">{skill.name}</span>
                          <span className="rag-document-meta">
                            {skill.key} · {skill.scope || "system"} · priority {skill.priority}
                          </span>
                        </button>
                        <Button
                          size="small"
                          type="text"
                          icon={<DeleteOutlined />}
                          title={skill.assignment_id ? "Xoá skill khỏi project" : "Skill mặc định không có assignment để xoá"}
                          loading={skillMutationId === skill.id}
                          disabled={!skill.assignment_id}
                          onClick={() => handleRemoveSkill(skill)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <Typography.Paragraph type="secondary">
                    Chưa gán skill riêng; agent sẽ dùng skill mặc định nếu cần.
                  </Typography.Paragraph>
                )}
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
      <Modal
        title={selectedSkill ? `${selectedSkill.name} skill` : "Skill"}
        open={Boolean(selectedSkill)}
        footer={null}
        width={780}
        onCancel={() => setSelectedSkill(null)}
      >
        {selectedSkill ? <SkillPromptPreview skill={selectedSkill} /> : null}
      </Modal>
    </ProjectPageFrame>
  );
}

function SkillPromptPreview({ skill }: { skill: AgentSkill }) {
  const prompts = skill.prompts ?? {};
  const entries = [
    ["analysis", "Prompt phân tích"],
    ["decider", "Prompt chọn action"],
    ["answer", "Prompt trả lời"],
    ["clarification", "Prompt hỏi làm rõ"],
  ] as const;

  return (
    <div className="skill-preview">
      <Typography.Paragraph type="secondary">
        Scope: {skill.scope || "system"} · Key: {skill.key} · Priority: {skill.priority}
      </Typography.Paragraph>
      {skill.description ? <Typography.Paragraph>{skill.description}</Typography.Paragraph> : null}
      {entries.map(([key, label]) => (
        <section className="skill-preview-section" key={key}>
          <Typography.Text strong>{label}</Typography.Text>
          <pre className="skill-preview-code">{prompts[key] || "Chưa có prompt riêng cho bước này."}</pre>
        </section>
      ))}
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
