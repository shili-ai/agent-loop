import type {
  AgentConversation,
  AgentConversationSummary,
  NewConversationInput,
} from "../types/agent";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function listConversations() {
  return request<AgentConversationSummary[]>("/api/agent_conversations");
}

export function getConversation(id: number) {
  return request<AgentConversation>(`/api/agent_conversations/${id}`);
}

export function createConversation(input: NewConversationInput) {
  return request<AgentConversation>("/api/agent_conversations", {
    method: "POST",
    body: JSON.stringify({
      agent_conversation: {
        title: input.title,
        industry: input.industry,
        customer_name: input.customer_name,
      },
    }),
  });
}

export function sendConversationMessage(conversationId: number, content: string) {
  return request<AgentConversation>(`/api/agent_conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message: { content } }),
  });
}
