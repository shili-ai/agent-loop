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

export type AgentConversation = {
  id: number;
  title: string;
  industry: string;
  customer_name: string | null;
  messages: AgentMessage[];
  runs: AgentRun[];
};

export type AgentConversationSummary = Pick<
  AgentConversation,
  "id" | "title" | "industry" | "customer_name"
> & {
  updated_at: string;
};

export type NewConversationInput = {
  title: string;
  industry: string;
  customer_name?: string;
};
