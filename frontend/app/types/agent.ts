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
  scope?: "system" | "project" | "chat" | "custom";
  prompts?: Partial<Record<"analysis" | "decider" | "answer" | "clarification", string>>;
  tool_policy?: Record<string, unknown>;
};

export type AgentSkillInput = {
  key: string;
  name: string;
  description?: string | null;
  priority: number;
  enabled: boolean;
  analysis_prompt?: string | null;
  decider_prompt?: string | null;
  answer_prompt?: string | null;
  clarification_prompt?: string | null;
  tool_policy?: Record<string, unknown>;
};

export type AgentSystemPrompt = {
  key: "analysis" | "decider" | "answer" | "clarification";
  label: string;
  base_system: string;
  composed_system: string;
  layers: {
    purpose: string;
    active_skills: Array<{
      key: string;
      name: string;
      priority: number;
      scope?: string;
    }>;
    has_project_prompt: boolean;
    has_chat_prompt: boolean;
  };
};

export type AgentConnector = {
  key: "google_drive" | string;
  name: string;
  description: string;
  enabled: boolean;
  status: "connected" | "disabled" | "missing_index" | "invalid_index" | "not_configured" | string;
  index_path?: string;
  browser_connected?: boolean;
  auth_url_available?: boolean;
  document_count?: number;
  last_checked_at?: string | null;
  message?: string;
};

export type AgentConnectorInput = {
  enabled: boolean;
  index_path?: string;
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
