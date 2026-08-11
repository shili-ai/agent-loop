"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelConversation,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listProjects,
  sendConversationMessage,
  uploadConversationDocument,
} from "../lib/agentApi";
import type {
  AgentConversation,
  AgentConversationSummary,
  AgentProject,
} from "../types/agent";
import ErrorNotice from "./atoms/ErrorNotice";
import AgentChatPanel from "./organisms/AgentChatPanel";
import AgentSidebar from "./organisms/AgentSidebar";
import AgentChatTemplate from "./templates/AgentChatTemplate";

const MODEL_OPTIONS = [
  "llama3.2:3b",
  "llama3.1:8b",
  "qwen3:8b",
  "deepseek:deepseek-v4-flash",
  "deepseek:deepseek-v4-pro",
];
const ACTIVE_POLL_MS = 1500;
const IDLE_POLL_MS = 8000;
const HIDDEN_TAB_POLL_MS = 15000;

function conversationIdFromPath(pathname: string): number | null {
  const match = /^\/chat\/(\d+)/.exec(pathname);
  return match ? Number(match[1]) : null;
}

function conversationProgressSignature(conversation: AgentConversation) {
  return conversation.runs
    .map((run) => `${run.id}:${run.status}:${run.steps.length}:${run.assistant_message_id ?? ""}`)
    .join("|");
}

export default function AgentChat() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeConversationId = useMemo(() => conversationIdFromPath(pathname), [pathname]);
  const draftProjectId = useMemo(() => {
    const value = searchParams.get("project");
    const id = value ? Number(value) : NaN;
    return Number.isFinite(id) ? id : null;
  }, [searchParams]);

  const optimisticMessageId = useRef(-1);
  const projectsRef = useRef<AgentProject[]>([]);
  const loadedKeyRef = useRef<number | string | null>(null);
  const latestConversationSignatureRef = useRef("");

  const [activeProjectConversations, setActiveProjectConversations] = useState<AgentConversationSummary[]>([]);
  const [activeProject, setActiveProject] = useState<AgentProject | null>(null);
  const [conversation, setConversation] = useState<AgentConversation | null>(null);
  const [draft, setDraft] = useState(false);
  const [ready, setReady] = useState(false);
  const [sidebarConversations, setSidebarConversations] = useState<AgentConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0]);
  const [projects, setProjects] = useState<AgentProject[]>([]);
  const [sending, setSending] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestRun = useMemo(() => conversation?.runs.at(-1), [conversation]);
  const openConversationId = conversation?.id;
  const hasRunningRun = useMemo(
    () => Boolean(conversation?.runs.some((run) => run.status === "running")),
    [conversation]
  );
  const chatDisabled = loading || sending || hasRunningRun || (!conversation && !draft);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    latestConversationSignatureRef.current = conversation ? conversationProgressSignature(conversation) : "";
  }, [conversation]);

  const refreshConversationList = useCallback(async (projectId?: number) => {
    const items = await listConversations(projectId);
    setActiveProjectConversations(items);
    return items;
  }, []);

  const refreshSidebarConversations = useCallback(async () => {
    const items = await listConversations();
    setSidebarConversations(items);
    return items;
  }, []);

  const loadConversation = useCallback(async (id: number) => {
    setLoading(true);
    setDraft(false);
    setError(null);

    try {
      const selected = await getConversation(id);
      setConversation(selected);
      setMessage("");
      const project =
        projectsRef.current.find((item) => item.id === selected.agent_project_id) ?? selected.project ?? null;
      if (project) setActiveProject(project);
      await refreshConversationList(selected.agent_project_id ?? undefined);
    } catch {
      setError("Không tải được đoạn chat. Có thể đã bị xoá.");
      loadedKeyRef.current = null;
      router.replace("/");
    } finally {
      setLoading(false);
    }
  }, [refreshConversationList, router]);

  const applyDraft = useCallback((projectId: number | null) => {
    setConversation(null);
    setDraft(true);
    setMessage("");
    setError(null);
    setActiveProject(projectId ? projectsRef.current.find((project) => project.id === projectId) ?? null : null);
    setLoading(false);
  }, []);

  // Load projects + sidebar once on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loadedProjects = await listProjects();
        if (cancelled) return;
        projectsRef.current = loadedProjects;
        setProjects(loadedProjects);
        await refreshSidebarConversations();
      } catch {
        if (!cancelled) setError("Không kết nối được Rails API. Kiểm tra backend port và NEXT_PUBLIC_API_URL.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshSidebarConversations]);

  // Keep the open conversation in sync with the URL.
  useEffect(() => {
    if (!ready) return;

    if (routeConversationId == null) {
      const key = `draft:${draftProjectId ?? ""}`;
      if (loadedKeyRef.current !== key) {
        loadedKeyRef.current = key;
        applyDraft(draftProjectId);
      }
      return;
    }

    if (loadedKeyRef.current === routeConversationId) return;
    loadedKeyRef.current = routeConversationId;
    void loadConversation(routeConversationId);
  }, [ready, routeConversationId, draftProjectId, applyDraft, loadConversation]);

  // Poll while a run is in progress. Back off when nothing changes so an old
  // running job cannot hammer the local Rails server forever.
  useEffect(() => {
    if (!openConversationId || !hasRunningRun) return;

    const conversationId = openConversationId;
    let cancelled = false;
    let timeoutId: number | undefined;
    let lastSignature = latestConversationSignatureRef.current;
    let unchangedPolls = 0;
    const controller = new AbortController();

    async function poll() {
      try {
        const updated = await getConversation(conversationId, { signal: controller.signal });
        if (cancelled) return;

        setConversation((current) => (current?.id === conversationId ? updated : current));
        const signature = conversationProgressSignature(updated);
        unchangedPolls = signature === lastSignature ? unchangedPolls + 1 : 0;
        lastSignature = signature;

        if (!updated.runs.some((run) => run.status === "running")) {
          void refreshConversationList(updated.agent_project_id ?? undefined);
          void refreshSidebarConversations();
          return;
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Không cập nhật được tiến trình agent realtime.");
          unchangedPolls += 1;
        }
      }

      if (cancelled) return;
      const delay =
        document.visibilityState === "hidden"
          ? HIDDEN_TAB_POLL_MS
          : unchangedPolls >= 3
            ? IDLE_POLL_MS
            : ACTIVE_POLL_MS;
      timeoutId = window.setTimeout(poll, delay);
    }

    timeoutId = window.setTimeout(poll, ACTIVE_POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [openConversationId, hasRunningRun, refreshConversationList, refreshSidebarConversations]);

  function openConversation(id: number) {
    router.push(`/chat/${id}`);
  }

  function startNewChat() {
    router.push("/");
  }

  async function handleDeleteConversation() {
    if (!conversation) {
      startNewChat();
      return;
    }

    const deletedId = conversation.id;
    setError(null);

    try {
      await deleteConversation(deletedId);
      const [projectItems, sidebarItems] = await Promise.all([
        refreshConversationList(activeProject?.id),
        refreshSidebarConversations(),
      ]);
      const next = projectItems.find((item) => item.id !== deletedId) ?? sidebarItems.find((item) => item.id !== deletedId);
      loadedKeyRef.current = null;
      if (next) {
        openConversation(next.id);
      } else {
        startNewChat();
      }
    } catch {
      setError("Không xoá được đoạn chat. Kiểm tra Rails API.");
    }
  }

  async function handleSend(value = message) {
    const text = value.trim();
    if (!text || sending || hasRunningRun) return;

    setSending(true);
    setError(null);

    try {
      let active = conversation;
      if (!active) {
        // Draft chat: persist the conversation only now that it has real content.
        active = await createConversation({ agent_project_id: activeProject?.id });
        loadedKeyRef.current = active.id;
        setDraft(false);
        router.replace(`/chat/${active.id}`);
      }

      const optimisticUserMessage = {
        id: optimisticMessageId.current--,
        role: "user" as const,
        content: text,
        created_at: "",
      };
      setConversation({ ...active, messages: [...active.messages, optimisticUserMessage] });

      const updated = await sendConversationMessage(active.id, text, selectedModel);
      setConversation(updated);
      setMessage("");
      await Promise.all([
        refreshConversationList(updated.agent_project_id ?? undefined),
        refreshSidebarConversations(),
      ]);
    } catch {
      setError("Agent loop bị lỗi khi xử lý tin nhắn. Thử lại hoặc xem log backend.");
    } finally {
      setSending(false);
    }
  }

  async function handleCancelRun() {
    if (!conversation || !hasRunningRun) return;

    setError(null);
    try {
      const updated = await cancelConversation(conversation.id);
      setConversation(updated);
      await Promise.all([
        refreshConversationList(updated.agent_project_id ?? undefined),
        refreshSidebarConversations(),
      ]);
    } catch {
      setError("Không huỷ được lượt chạy hiện tại. Kiểm tra Rails API.");
    } finally {
      setSending(false);
    }
  }

  async function handleUploadDocument(file: File) {
    if (!conversation || uploadingDocument) return;

    setUploadingDocument(true);
    setError(null);

    try {
      await uploadConversationDocument(conversation.id, file);
      const updated = await getConversation(conversation.id);
      setConversation(updated);
      await Promise.all([
        refreshConversationList(updated.agent_project_id ?? undefined),
        refreshSidebarConversations(),
      ]);
    } catch {
      setError("Không tải được tài liệu vào đoạn chat. Chỉ hỗ trợ tốt file text/markdown/csv/json/html ở bản này.");
    } finally {
      setUploadingDocument(false);
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
          onCreateConversation={startNewChat}
          onSelectProject={(id) => router.push(`/projects/${id}`)}
          onSelectConversation={openConversation}
        />
      }
      chatPanel={
        <AgentChatPanel
          activeProject={activeProject}
          conversation={conversation}
          draft={draft}
          disabled={chatDisabled}
          latestRun={latestRun}
          loading={loading}
          message={message}
          model={selectedModel}
          modelOptions={MODEL_OPTIONS}
          sending={sending}
          running={hasRunningRun}
          uploadingDocument={uploadingDocument}
          onChangeMessage={setMessage}
          onChangeModel={setSelectedModel}
          onSend={() => handleSend()}
          onCancel={handleCancelRun}
          onClarify={(text) => handleSend(text)}
          onDelete={handleDeleteConversation}
          onUploadDocument={conversation ? handleUploadDocument : undefined}
        />
      }
      newConversationModal={null}
    />
  );
}
