"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  sendConversationMessage,
} from "../lib/agentApi";
import type {
  AgentConversation,
  AgentConversationSummary,
  NewConversationInput,
} from "../types/agent";
import ErrorNotice from "./atoms/ErrorNotice";
import NewConversationModal from "./molecules/NewConversationModal";
import AgentChatPanel from "./organisms/AgentChatPanel";
import AgentSidebar from "./organisms/AgentSidebar";
import AgentChatTemplate from "./templates/AgentChatTemplate";

export default function AgentChat() {
  const optimisticMessageId = useRef(-1);
  const [conversation, setConversation] = useState<AgentConversation | null>(null);
  const [conversations, setConversations] = useState<AgentConversationSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestRun = useMemo(() => conversation?.runs.at(-1), [conversation]);
  const hasRunningRun = useMemo(
    () => Boolean(conversation?.runs.some((run) => run.status === "running")),
    [conversation]
  );
  const chatDisabled = loading || sending || hasRunningRun || !conversation;

  const refreshConversationList = useCallback(async () => {
    const items = await listConversations();
    setConversations(items);
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
      setError("Khong tai duoc chat. Kiem tra Rails API.");
    } finally {
      setLoading(false);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const items = await refreshConversationList();
      if (items[0]) {
        const selected = await getConversation(items[0].id);
        setConversation(selected);
      }
    } catch {
      setError("Khong ket noi duoc Rails API. Kiem tra backend port va NEXT_PUBLIC_API_URL.");
    } finally {
      setLoading(false);
    }
  }, [refreshConversationList]);

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
        setError("Khong cap nhat duoc tien trinh agent realtime.");
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [conversation, hasRunningRun]);

  async function handleCreateConversation(input: NewConversationInput) {
    setCreating(true);
    setError(null);

    try {
      const created = await createConversation(input);
      setConversation(created);
      setModalOpen(false);
      setMessage("");
      await refreshConversationList();
    } catch {
      setError("Khong tao duoc chat moi. Kiem tra Rails API.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteConversation(id: number) {
    setLoading(true);
    setError(null);

    try {
      await deleteConversation(id);
      const remainingConversations = await refreshConversationList();
      const nextConversation = remainingConversations.find((item) => item.id !== id) ?? remainingConversations[0];

      if (conversation?.id === id) {
        if (nextConversation) {
          setConversation(await getConversation(nextConversation.id));
        } else {
          setConversation(null);
        }
        setMessage("");
      }
    } catch {
      setError("Khong xoa duoc chat. Kiem tra Rails API.");
    } finally {
      setLoading(false);
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
      await refreshConversationList();
    } catch {
      setError("Agent loop bi loi khi xu ly message. Thu lai hoac xem log backend.");
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
          conversations={conversations}
          loading={loading}
          onCreateConversation={() => setModalOpen(true)}
          onDeleteConversation={handleDeleteConversation}
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
        />
      }
      newConversationModal={
        <NewConversationModal
          creating={creating}
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          onCreate={handleCreateConversation}
        />
      }
    />
  );
}
