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

export type AgentDocument = {
  id: number;
  agent_project_id: number | null;
  agent_conversation_id: number | null;
  title: string;
  filename: string;
  content_type: string | null;
  byte_size: number;
  summary: string | null;
  content_preview: string;
  extracted: boolean;
  created_at: string;
};

export type AgentSkill = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  priority: number;
  assignment_id?: number | null;
  enabled: boolean;
};

export type AgentProject = {
  id: number;
  title: string;
  industry: string;
  customer_name: string | null;
  description: string | null;
  shared_context: string | null;
  skills?: AgentSkill[];
  documents?: AgentDocument[];
  updated_at?: string;
};

export type AgentConversation = {
  id: number;
  agent_project_id: number | null;
  title: string;
  industry: string;
  customer_name: string | null;
  project?: AgentProject | null;
  skills?: AgentSkill[];
  documents?: AgentDocument[];
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
