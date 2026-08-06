import type { AgentRun, AgentStep } from "../types/agent";

export type ClarificationQuestion = {
  id?: string;
  question: string;
  type?: "choice" | "text";
  options?: string[];
};

export function clarificationQuestionsFromStep(step?: AgentStep): ClarificationQuestion[] {
  const questions = step?.data.questions;
  if (!Array.isArray(questions)) return [];

  return questions
    .map((item): ClarificationQuestion | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      if (typeof record.question !== "string") return null;

      return {
        id: typeof record.id === "string" ? record.id : undefined,
        question: record.question,
        type: record.type === "choice" ? "choice" : "text",
        options: Array.isArray(record.options) ? record.options.map(String) : undefined,
      };
    })
    .filter((item): item is ClarificationQuestion => item !== null);
}

// Câu hỏi clarification đang chờ trả lời của run mới nhất (đã chạy xong).
export function pendingClarification(run?: AgentRun): ClarificationQuestion[] {
  if (!run || run.status === "running") return [];
  return clarificationQuestionsFromStep(run.steps.find((step) => step.kind === "clarification"));
}
