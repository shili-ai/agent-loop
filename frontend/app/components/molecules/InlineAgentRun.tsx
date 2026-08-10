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
import { Collapse, List, Space, Typography } from "antd";
import type { ReactNode } from "react";
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
        <div className="reason-head">
          <span className="reason-label">Đang suy luận…</span>
        </div>
        <div className="reason-text">Model đang phân tích và lập luận để tìm hướng trả lời.</div>
      </div>
    </div>
  );
}

function StepActivity({ step }: { step: AgentStep }) {
  const [showIo, setShowIo] = useState(false);
  const output = normalizeOutput(step);
  const tone = stepTone(step);
  const details = stepDetails(step);

  return (
    <div className={`reason-step ${tone}`}>
      <span className="reason-icon">{stepIcon(step)}</span>
      <div className="reason-content">
        <div className="reason-head">
          <span className="reason-label">{stepLabel(step)}</span>
          <button type="button" className="reason-io" onClick={() => setShowIo((value) => !value)}>
            {showIo ? "Ẩn I/O" : "I/O"}
          </button>
        </div>
        {details ? <div className="reason-note">{details}</div> : null}
        {step.summary ? <div className="reason-text">{step.summary}</div> : null}
        {output ? <div className="reason-output">{output}</div> : null}
        {showIo ? <StepIoPanel step={step} /> : null}
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

function StepIoPanel({ step }: { step: AgentStep }) {
  const input = stepInput(step);
  const output = stepOutput(step);

  return (
    <div className="step-io-panel">
      <div className="step-io-column">
        <Typography.Text strong>Input</Typography.Text>
        <pre>{JSON.stringify(input, null, 2)}</pre>
      </div>
      <div className="step-io-column">
        <Typography.Text strong>Output</Typography.Text>
        <pre>{output}</pre>
      </div>
    </div>
  );
}

function stepInput(step: AgentStep) {
  const data = step.data;
  const base = {
    kind: step.kind,
    title: step.title,
    summary: step.summary,
  };

  if (step.kind === "llm") {
    return {
      ...base,
      provider: data.provider,
      model: data.model,
      status: data.status,
      request_started_at: data.request_started_at,
      first_token_at: data.first_token_at,
      last_token_at: data.last_token_at,
      request_completed_at: data.request_completed_at,
      first_token_latency_ms: data.first_token_latency_ms,
      last_token_latency_ms: data.last_token_latency_ms,
      total_duration_ms: data.total_duration_ms,
      streamed_chunks: data.streamed_chunks,
    };
  }

  if (step.kind === "decision") {
    return {
      ...base,
      iteration: data.iteration,
      action: data.action,
      reason: data.reason,
      source: data.source,
      model: data.model,
    };
  }

  if (step.kind === "document_search" || step.kind === "web_search") {
    return {
      ...base,
      tools: data.tools,
    };
  }

  if (step.kind === "artifact") {
    return {
      ...base,
      tools: data.tools,
      artifact_title: artifactTitle(data.artifact),
    };
  }

  return compactData(data, ["output", "diagram"]);
}

function stepOutput(step: AgentStep) {
  return JSON.stringify(step.data, null, 2);
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
  if (step.kind === "flow") return <CheckCircleOutlined />;
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

function stepDetails(step: AgentStep) {
  if (step.kind === "llm") {
    const model = typeof step.data.model === "string" ? step.data.model : "model local";
    const provider = typeof step.data.provider === "string" ? step.data.provider : "ollama";
    const ttft = formatMs(metricNumber(step.data.first_token_latency_ms));
    const total = formatMs(metricNumber(step.data.total_duration_ms));
    return `${provider} · ${model}${ttft ? ` · token đầu: ${ttft}` : ""}${total ? ` · tổng: ${total}` : ""}`;
  }

  const tools = step.data.tools;
  if (Array.isArray(tools) && tools.length) {
    return `Công cụ: ${tools.map(String).join(", ")}`;
  }

  if (step.kind === "decision" && typeof step.data.action === "string") {
    return `Action được chọn: ${step.data.action}`;
  }

  if (step.kind === "evaluation" && typeof step.data.done === "boolean") {
    return step.data.done ? "Kết luận: đủ dữ liệu để kết thúc" : "Kết luận: cần chạy tiếp";
  }

  return null;
}

function normalizeOutput(step: AgentStep): ReactNode {
  if (step.kind === "answer") return null;
  if (step.kind === "tool") return <ToolOutput data={step.data} />;

  if (typeof step.data.output === "string" && step.data.output.trim() && step.kind !== "llm") {
    return <MarkdownContent className="markdown-content step-output-text">{step.data.output}</MarkdownContent>;
  }

  if (step.kind === "llm" && typeof step.data.output === "string" && step.data.output.trim()) {
    return (
      <Space direction="vertical" size={10} className="full-width">
        <ModelMetrics data={step.data} />
        <Collapse
          ghost
          size="small"
          className="codex-output-collapse"
          items={[
            {
              key: "model-output",
              label: "Bản nháp từ model",
              children: (
                <MarkdownContent className="markdown-content step-output-text">{step.data.output}</MarkdownContent>
              ),
            },
          ]}
        />
      </Space>
    );
  }

  if (step.kind === "reasoning" && typeof step.data.intent === "string") {
    return (
      <Typography.Paragraph className="codex-step-body">
        Agent chọn hướng: <Typography.Text code>{step.data.intent}</Typography.Text>
      </Typography.Paragraph>
    );
  }

  if (step.data.error) {
    return <Typography.Text type="danger">{String(step.data.error)}</Typography.Text>;
  }

  return null;
}

function ModelMetrics({ data }: { data: Record<string, unknown> }) {
  return (
    <Typography.Text className="model-metrics">
      <Typography.Text strong>Model:</Typography.Text> {stringValue(data.provider, "ollama")} ·{" "}
      {stringValue(data.model, "-")} · <Typography.Text italic>token đầu</Typography.Text>{" "}
      {metricTime(data.first_token_at, data.first_token_latency_ms)} ·{" "}
      <Typography.Text italic>tổng</Typography.Text> {formatMs(metricNumber(data.total_duration_ms)) ?? "-"} · chunks{" "}
      {String(data.streamed_chunks ?? "-")}
    </Typography.Text>
  );
}

function metricTime(timestamp: unknown, latency: unknown) {
  const time = formatTime(timestamp);
  const duration = formatMs(metricNumber(latency));
  return duration ? `${time} (${duration})` : time;
}

function formatTime(value: unknown) {
  if (typeof value !== "string" || !value) return "-";

  try {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatMs(value: number | null) {
  if (value === null) return null;
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function metricNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value : fallback;
}

function ToolOutput({ data }: { data: Record<string, unknown> }) {
  const tools = data.tools as string[] | undefined;
  const artifact = data.artifact as { title?: string; bullets?: string[] } | undefined;
  const documents = data.documents as Array<{ title?: string; type?: string; snippet?: string }> | undefined;
  const webResults = data.web_results as Array<{ title?: string; url?: string; snippet?: string; source?: string }> | undefined;
  const markdownOutput = typeof data.output === "string" && data.output.trim() ? data.output : null;

  return (
    <Space direction="vertical" size={8} className="full-width">
      {markdownOutput ? <MarkdownContent className="markdown-content step-output-text">{markdownOutput}</MarkdownContent> : null}

      {tools?.length ? (
        <Typography.Text type="secondary">
          <Typography.Text strong>Công cụ:</Typography.Text> {tools.join(", ")}
        </Typography.Text>
      ) : null}

      {artifact?.bullets?.length ? (
        <List
          size="small"
          header={<Typography.Text strong>{artifact.title}</Typography.Text>}
          dataSource={artifact.bullets}
          renderItem={(item) => <List.Item>{item}</List.Item>}
        />
      ) : null}

      {documents?.length ? (
        <Collapse
          ghost
          size="small"
          className="codex-output-collapse"
          items={[
            {
              key: "documents",
              label: `Tài liệu tìm thấy (${documents.length})`,
              children: (
                <List
                  size="small"
                  dataSource={documents}
                  renderItem={(document) => (
                    <List.Item>
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>{document.title}</Typography.Text>
                        <Typography.Text type="secondary">
                          {document.type}: {document.snippet}
                        </Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              ),
            },
          ]}
        />
      ) : null}

      {webResults?.length ? (
        <Collapse
          ghost
          size="small"
          className="codex-output-collapse"
          items={[
            {
              key: "web-results",
              label: `Kết quả web (${webResults.length})`,
              children: (
                <List
                  size="small"
                  dataSource={webResults}
                  renderItem={(result) => (
                    <List.Item>
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>{result.title}</Typography.Text>
                        <Typography.Text type="secondary">
                          {result.url ? `${result.url}: ` : ""}
                          {result.snippet}
                        </Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              ),
            },
          ]}
        />
      ) : null}
    </Space>
  );
}
