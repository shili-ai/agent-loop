"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createConversation,
  createProject,
  getConversation,
  listConversations,
  listProjects,
  sendConversationMessage,
  updateProject,
} from "../lib/agentApi";
import type {
  AgentConversation,
  AgentConversationSummary,
  AgentProject,
  NewConversationInput,
  NewProjectInput,
} from "../types/agent";
import ErrorNotice from "./atoms/ErrorNotice";
import NewConversationModal from "./molecules/NewConversationModal";
import ProjectModal from "./molecules/ProjectModal";
import AgentChatPanel from "./organisms/AgentChatPanel";
import AgentSidebar from "./organisms/AgentSidebar";
import AgentChatTemplate from "./templates/AgentChatTemplate";

export default function AgentChat() {
  const router = useRouter();
  const optimisticMessageId = useRef(-1);
  const [activeProjectConversations, setActiveProjectConversations] = useState<AgentConversationSummary[]>([]);
  const [activeProject, setActiveProject] = useState<AgentProject | null>(null);
  const [conversation, setConversation] = useState<AgentConversation | null>(null);
  const [sidebarConversations, setSidebarConversations] = useState<AgentConversationSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [projectModalMode] = useState<"create" | "edit">("create");
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projects, setProjects] = useState<AgentProject[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestRun = useMemo(() => conversation?.runs.at(-1), [conversation]);
  const hasRunningRun = useMemo(
    () => Boolean(conversation?.runs.some((run) => run.status === "running")),
    [conversation]
  );
  const chatDisabled = loading || sending || hasRunningRun || !conversation;

  const refreshConversationList = useCallback(async (projectId = activeProject?.id) => {
    const items = await listConversations(projectId);
    setActiveProjectConversations(items);
    return items;
  }, [activeProject?.id]);

  const refreshSidebarConversations = useCallback(async () => {
    const items = await listConversations();
    setSidebarConversations(items);
    return items;
  }, []);

  const selectConversation = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);

    try {
      const selected = await getConversation(id);
      setConversation(selected);
      setMessage("");
    } catch {
      setError("Không tải được chat. Kiểm tra Rails API.");
    } finally {
      setLoading(false);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const loadedProjects = await listProjects();
      setProjects(loadedProjects);
      const searchParams = new URLSearchParams(window.location.search);
      const conversationIdParam = searchParams.get("conversation_id");
      const conversationIdFromUrl = conversationIdParam ? Number(conversationIdParam) : null;
      const shouldOpenNewChat = searchParams.get("new_chat") === "1";
      const selectedConversation = conversationIdFromUrl && Number.isFinite(conversationIdFromUrl)
        ? await getConversation(conversationIdFromUrl)
        : null;
      const selectedProject =
        loadedProjects.find((project) => project.id === selectedConversation?.agent_project_id) ??
        loadedProjects[0] ??
        null;
      setActiveProject(selectedProject);

      const [items] = await Promise.all([
        refreshConversationList(selectedProject?.id),
        refreshSidebarConversations(),
      ]);
      if (selectedConversation) {
        setConversation(selectedConversation);
      } else if (items[0]) {
        setConversation(await getConversation(items[0].id));
      }
      if (shouldOpenNewChat) setModalOpen(true);
    } catch {
      setError("Không kết nối được Rails API. Kiểm tra backend port và NEXT_PUBLIC_API_URL.");
    } finally {
      setLoading(false);
    }
  }, [refreshConversationList, refreshSidebarConversations]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!conversation || !hasRunningRun) return;

    const conversationId = conversation.id;
    const interval = window.setInterval(async () => {
      try {
        const updated = await getConversation(conversationId);
        setConversation((current) => (current?.id === conversationId ? updated : current));
      } catch {
        setError("Không cập nhật được tiến trình agent realtime.");
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [conversation, hasRunningRun]);

  async function handleCreateConversation(input: NewConversationInput) {
    setCreating(true);
    setError(null);

    try {
      const created = await createConversation({
        ...input,
        agent_project_id: activeProject?.id,
        industry: input.industry || activeProject?.industry || "Phần mềm",
        customer_name: input.customer_name || activeProject?.customer_name || undefined,
      });
      setConversation(created);
      setModalOpen(false);
      setMessage("");
      await Promise.all([refreshConversationList(activeProject?.id), refreshSidebarConversations()]);
    } catch {
      setError("Không tạo được chat mới. Kiểm tra Rails API.");
    } finally {
      setCreating(false);
    }
  }

  async function handleProjectModalSubmit(input: NewProjectInput) {
    setProjectSaving(true);
    setError(null);

    try {
      if (projectModalMode === "create") {
        const created = await createProject(input);
        const loadedProjects = await listProjects();
        setProjects(loadedProjects);
        setActiveProject(created);
        setConversation(null);
        setActiveProjectConversations([]);
        await refreshSidebarConversations();
        setMessage("");
      } else if (activeProject) {
        const updated = await updateProject(activeProject.id, input);
        setActiveProject(updated);
        setProjects((current) => current.map((project) => (project.id === updated.id ? updated : project)));
      }
      setProjectModalOpen(false);
    } catch {
      setError("Không lưu được project. Kiểm tra Rails API.");
    } finally {
      setProjectSaving(false);
    }
  }

  async function handleSend(value = message) {
    if (!conversation || !value.trim()) return;

    const optimisticUserMessage = {
      id: optimisticMessageId.current--,
      role: "user" as const,
      content: value.trim(),
      created_at: "",
    };

    setSending(true);
    setError(null);
    setConversation({
      ...conversation,
      messages: [...conversation.messages, optimisticUserMessage],
    });

    try {
      const updated = await sendConversationMessage(conversation.id, value.trim());
      setConversation(updated);
      setMessage("");
      await Promise.all([refreshConversationList(), refreshSidebarConversations()]);
    } catch {
      setError("Agent loop bị lỗi khi xử lý tin nhắn. Thử lại hoặc xem log backend.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AgentChatTemplate
      errorNotice={<ErrorNotice message={error} />}
      sidebar={
        <AgentSidebar
          activeConversation={conversation}
          activeProject={activeProject}
          activeProjectConversations={activeProjectConversations}
          conversations={sidebarConversations}
          loading={loading}
          projects={projects}
          onCreateConversation={() => setModalOpen(true)}
          onCreateProject={() => setProjectModalOpen(true)}
          onSelectProject={(id) => router.push(`/projects/${id}`)}
          onSelectConversation={selectConversation}
        />
      }
      chatPanel={
        <AgentChatPanel
          conversation={conversation}
          disabled={chatDisabled}
          latestRun={latestRun}
          loading={loading}
          message={message}
          sending={sending}
          onChangeMessage={setMessage}
          onSend={() => handleSend()}
          onClarify={(text) => handleSend(text)}
        />
      }
      newConversationModal={
        <>
          <NewConversationModal
            creating={creating}
            open={modalOpen}
            project={activeProject}
            onCancel={() => setModalOpen(false)}
            onCreate={handleCreateConversation}
          />
          <ProjectModal
            mode={projectModalMode}
            open={projectModalOpen}
            project={activeProject}
            saving={projectSaving}
            onCancel={() => setProjectModalOpen(false)}
            onSubmit={handleProjectModalSubmit}
          />
        </>
      }
    />
  );
}
