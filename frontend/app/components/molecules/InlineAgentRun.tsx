"use client";

import {
  BulbOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  RightOutlined,
  RobotOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Space, Typography } from "antd";
import { useState } from "react";
import type { AgentMessage, AgentRun, AgentStep } from "../../types/agent";
import MarkdownContent from "../atoms/MarkdownContent";
import MessageActions from "../atoms/MessageActions";

type InlineAgentRunProps = {
  finalAnswer?: AgentMessage;
  pending?: boolean;
  run?: AgentRun;
};

export default function InlineAgentRun({ finalAnswer, pending = false, run }: InlineAgentRunProps) {
  const steps = run?.steps ?? [];
  const visibleSteps = steps.filter((step) => step.kind !== "flow");
  const running = pending || run?.status === "running";
  const [expanded, setExpanded] = useState(false);
  const showSteps = running || expanded;

  return (
    <div className="codex-run">
      <Space direction="vertical" size={10} className="full-width">
        <button
          type="button"
          className={running ? "run-summary running" : "run-summary"}
          onClick={() => !running && setExpanded((value) => !value)}
          disabled={running}
        >
          {running ? <LoadingOutlined /> : <CheckCircleOutlined className="run-summary-check" />}
          <span className="run-summary-label">{runLabel(run, running, visibleSteps.length)}</span>
          {!running && visibleSteps.length ? (
            <RightOutlined className={expanded ? "run-summary-caret open" : "run-summary-caret"} />
          ) : null}
        </button>

        {showSteps ? (
          <div className="run-steps">
            {visibleSteps.map((step) => <StepActivity key={step.id} step={step} />)}
            {running ? <PendingActivity /> : null}
          </div>
        ) : null}

        {!running ? <FinalAnswer message={finalAnswer} run={run} /> : null}
      </Space>
    </div>
  );
}

function runLabel(run: AgentRun | undefined, running: boolean, stepCount: number) {
  if (running) return stepCount ? `Đang suy luận… (${stepCount} bước)` : "Đang suy luận…";
  if (run?.status === "failed") return `Đã dừng sau ${stepCount} bước suy luận`;
  if (run) return stepCount ? `Đã suy luận qua ${stepCount} bước` : "Đã suy luận";
  return "Đã suy luận";
}

function PendingActivity() {
  return (
    <div className="reason-step pending">
      <span className="reason-icon">
        <LoadingOutlined />
      </span>
      <div className="reason-content">
        <div className="reason-text">Model đang phân tích và lập luận để tìm hướng trả lời…</div>
      </div>
    </div>
  );
}

function StepActivity({ step }: { step: AgentStep }) {
  const [showDetail, setShowDetail] = useState(false);
  const tone = stepTone(step);
  const text = reasoningText(step);

  return (
    <div className={`reason-step ${tone}`}>
      <span className="reason-icon">{stepIcon(step)}</span>
      <div className="reason-content">
        <div className="reason-head">
          <span className="reason-label">{stepLabel(step)}</span>
          <button type="button" className="reason-io" onClick={() => setShowDetail((value) => !value)}>
            {showDetail ? "Ẩn chi tiết" : "Chi tiết"}
          </button>
        </div>
        {text ? <div className="reason-text">{text}</div> : null}
        {showDetail ? <StepIoPanel step={step} /> : null}
      </div>
    </div>
  );
}

function FinalAnswer({ message, run }: { message?: AgentMessage; run?: AgentRun }) {
  const answer = message?.content ?? answerFromRun(run);
  if (!answer) return null;

  return (
    <section className="final-answer-section">
      <MarkdownContent className="markdown-content codex-final-answer">{answer}</MarkdownContent>
      <MessageActions content={answer} />
    </section>
  );
}

function answerFromRun(run?: AgentRun) {
  const answerStep = run?.steps.find((step) => step.kind === "answer");
  const output = answerStep?.data.output;
  return typeof output === "string" ? output : undefined;
}

// A single, natural-language "thought" for each step — the backend now emits a
// detailed sentence per step, so the trace just shows it (no structured dumps).
function reasoningText(step: AgentStep): string {
  const data = step.data ?? {};
  if (step.kind === "error" && data.error) return String(data.error);
  return step.summary || "";
}

function StepIoPanel({ step }: { step: AgentStep }) {
  return (
    <div className="step-io-panel">
      <div className="step-io-column">
        <Typography.Text strong>Input</Typography.Text>
        <pre>{JSON.stringify(stepInput(step), null, 2)}</pre>
      </div>
      <div className="step-io-column">
        <Typography.Text strong>Output</Typography.Text>
        <pre>{JSON.stringify(step.data, null, 2)}</pre>
      </div>
    </div>
  );
}

function stepInput(step: AgentStep) {
  const data = step.data;
  const base = { kind: step.kind, title: step.title, summary: step.summary };

  if (step.kind === "llm") {
    return {
      ...base,
      provider: data.provider,
      model: data.model,
      status: data.status,
      first_token_latency_ms: data.first_token_latency_ms,
      total_duration_ms: data.total_duration_ms,
      streamed_chunks: data.streamed_chunks,
    };
  }

  if (step.kind === "decision") {
    return { ...base, iteration: data.iteration, action: data.action, reason: data.reason, source: data.source };
  }

  if (step.kind === "document_search" || step.kind === "web_search") {
    return { ...base, tools: data.tools };
  }

  if (step.kind === "artifact") {
    return { ...base, tools: data.tools, artifact_title: artifactTitle(data.artifact) };
  }

  return compactData(data, ["output", "diagram"]);
}

function compactData(data: Record<string, unknown>, omitKeys: string[]) {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !omitKeys.includes(key)));
}

function artifactTitle(artifact: unknown) {
  if (artifact && typeof artifact === "object" && "title" in artifact) {
    return String((artifact as { title?: unknown }).title ?? "");
  }
  return undefined;
}

function stepIcon(step: AgentStep) {
  if (step.kind === "context") return <FileSearchOutlined />;
  if (step.kind === "plan") return <BulbOutlined />;
  if (step.kind === "reasoning") return <BulbOutlined />;
  if (step.kind === "decision") return <BulbOutlined />;
  if (step.kind === "evaluation") return <CheckCircleOutlined />;
  if (step.kind === "document_search") return <FileSearchOutlined />;
  if (step.kind === "web_search") return <FileSearchOutlined />;
  if (step.kind === "artifact") return <ToolOutlined />;
  if (step.kind === "clarification") return <BulbOutlined />;
  if (step.kind === "tool") return <ToolOutlined />;
  if (step.kind === "llm") return <RobotOutlined />;
  if (step.kind === "answer") return <CheckCircleOutlined />;
  if (step.kind === "error") return <CloseCircleOutlined />;
  return <CheckCircleOutlined />;
}

function stepLabel(step: AgentStep) {
  if (step.kind === "context") return "Xem lại ngữ cảnh cuộc trò chuyện";
  if (step.kind === "plan") return "Phác thảo hướng tiếp cận";
  if (step.kind === "reasoning") return "Phân tích yêu cầu";
  if (step.kind === "decision") return "Cân nhắc bước tiếp theo";
  if (step.kind === "evaluation") return "Tự đánh giá tiến độ";
  if (step.kind === "document_search") return "Tìm tài liệu liên quan";
  if (step.kind === "web_search") return "Tra cứu trên web";
  if (step.kind === "artifact") return "Soạn bản nháp";
  if (step.kind === "clarification") return "Đặt câu hỏi làm rõ";
  if (step.kind === "tool") return "Dùng công cụ";
  if (step.kind === "llm") return "Suy nghĩ với model";
  if (step.kind === "answer") return "Tổng hợp câu trả lời";
  if (step.kind === "error") return "Đã dừng";
  return step.title;
}

function stepTone(step: AgentStep) {
  if (["document_search", "web_search", "artifact", "tool"].includes(step.kind)) return "tool";
  if (step.kind === "llm") return "model";
  if (["decision", "evaluation", "plan", "reasoning"].includes(step.kind)) return "thinking";
  if (step.kind === "answer") return "final";
  if (step.kind === "error") return "error";
  return "agent";
}
