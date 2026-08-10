import type {
  AgentConversation,
  AgentConversationSummary,
  AgentDocument,
  AgentProject,
  NewConversationInput,
  NewProjectInput,
} from "../types/agent";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const body = init?.body;
  const headers = body instanceof FormData
    ? init?.headers
    : {
        "Content-Type": "application/json",
        ...init?.headers,
      };
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function listProjects() {
  return request<AgentProject[]>("/api/agent_projects");
}

export function getProject(id: number) {
  return request<AgentProject>(`/api/agent_projects/${id}`);
}

export function createProject(input: NewProjectInput) {
  return request<AgentProject>("/api/agent_projects", {
    method: "POST",
    body: JSON.stringify({ agent_project: input }),
  });
}

export function updateProject(id: number, input: NewProjectInput) {
  return request<AgentProject>(`/api/agent_projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ agent_project: input }),
  });
}

export function listConversations(projectId?: number) {
  const query = projectId ? `?agent_project_id=${projectId}` : "";
  return request<AgentConversationSummary[]>(`/api/agent_conversations${query}`);
}

export function getConversation(id: number) {
  return request<AgentConversation>(`/api/agent_conversations/${id}`);
}

export function createConversation(input: NewConversationInput = {}) {
  return request<AgentConversation>("/api/agent_conversations", {
    method: "POST",
    body: JSON.stringify({
      agent_conversation: {
        title: input.title,
        industry: input.industry,
        customer_name: input.customer_name,
        agent_project_id: input.agent_project_id,
      },
    }),
  });
}

export function deleteConversation(id: number) {
  return request<void>(`/api/agent_conversations/${id}`, {
    method: "DELETE",
  });
}

export function sendConversationMessage(conversationId: number, content: string, model?: string) {
  return request<AgentConversation>(`/api/agent_conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message: { content, model } }),
  });
}

export function uploadProjectDocument(projectId: number, file: File) {
  const body = new FormData();
  body.append("file", file);
  return request<AgentDocument>(`/api/agent_projects/${projectId}/documents`, {
    method: "POST",
    body,
  });
}

export function uploadConversationDocument(conversationId: number, file: File) {
  const body = new FormData();
  body.append("file", file);
  return request<AgentDocument>(`/api/agent_conversations/${conversationId}/documents`, {
    method: "POST",
    body,
  });
}
