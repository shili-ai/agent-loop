export type AgentMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export type AgentStep = {
  id: number;
  position: number;
  kind: string;
  title: string;
  summary: string;
  data: Record<string, unknown>;
};

export type AgentRun = {
  id: number;
  status: string;
  intent: string | null;
  user_message_id: number;
  assistant_message_id: number | null;
  steps: AgentStep[];
};

export type AgentProject = {
  id: number;
  title: string;
  industry: string;
  customer_name: string | null;
  description: string | null;
  shared_context: string | null;
  updated_at?: string;
};

export type AgentConversation = {
  id: number;
  agent_project_id: number | null;
  title: string;
  industry: string;
  customer_name: string | null;
  project?: AgentProject | null;
  messages: AgentMessage[];
  runs: AgentRun[];
};

export type AgentConversationSummary = Pick<
  AgentConversation,
  "agent_project_id" | "id" | "title" | "industry" | "customer_name"
> & {
  updated_at: string;
};

export type NewConversationInput = {
  title?: string;
  industry?: string;
  customer_name?: string;
  agent_project_id?: number;
};

export type NewProjectInput = {
  title: string;
  industry: string;
  customer_name?: string | null;
  description?: string | null;
  shared_context?: string | null;
};
