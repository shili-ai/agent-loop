"use client";

import {
  BulbOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  RobotOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Button, Collapse, Descriptions, List, Space, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { useState } from "react";
import type { AgentMessage, AgentRun, AgentStep } from "../../types/agent";
import MarkdownContent from "../atoms/MarkdownContent";
import MermaidDiagram from "../atoms/MermaidDiagram";

type InlineAgentRunProps = {
  finalAnswer?: AgentMessage;
  pending?: boolean;
  run?: AgentRun;
};

export default function InlineAgentRun({ finalAnswer, pending = false, run }: InlineAgentRunProps) {
  const steps = run?.steps ?? [];
  const flowStep = steps.find((step) => step.kind === "flow");
  const visibleSteps = steps.filter((step) => step.kind !== "flow");
  const running = pending || run?.status === "running";

  return (
    <div className="codex-run">
      <Space direction="vertical" size={14} className="full-width">
        <div className="run-summary">
          <Space direction="vertical" size={8}>
            <Space size={8}>
              {running ? <LoadingOutlined /> : <CheckCircleOutlined />}
              <Typography.Text strong>{runLabel(run, running, visibleSteps.length)}</Typography.Text>
            </Space>
            <Space size={6} wrap>
              <Tag className="step-kind thinking">Decision</Tag>
              <Tag className="step-kind tool">Tool</Tag>
              <Tag className="step-kind model">AI model</Tag>
              <Tag className="step-kind final">Final</Tag>
            </Space>
          </Space>
        </div>

        {visibleSteps.map((step, index) => <StepActivity key={step.id} index={index} step={step} />)}
        {running ? <PendingActivity hasSteps={visibleSteps.length > 0} /> : null}

        {!running ? <FinalAnswer message={finalAnswer} run={run} /> : null}
        {!running && flowStep ? <FlowDiagramStep step={flowStep} /> : null}
      </Space>
    </div>
  );
}

function runLabel(run: AgentRun | undefined, running: boolean, stepCount: number) {
  if (running) return stepCount ? `Đang xử lý... đã xong ${stepCount} bước` : "Đang xử lý...";
  if (run?.status === "failed") return `Đã dừng sau ${stepCount} bước`;
  if (run) return `Hoàn tất ${stepCount} bước`;
  return "Hoàn tất";
}

function PendingActivity({ hasSteps }: { hasSteps: boolean }) {
  return (
    <div className="agent-step-card pending">
      <div className="agent-step-header">
        <span className="agent-step-icon">
          <LoadingOutlined />
        </span>
        <div className="agent-step-heading">
          <Typography.Text strong>{hasSteps ? "Đang xử lý tiếp" : "Đang chạy agent loop"}</Typography.Text>
          <Typography.Text type="secondary">Realtime</Typography.Text>
        </div>
      </div>
      <Typography.Paragraph className="codex-step-body">
        Agent đang xử lý và sẽ tự cập nhật ngay khi có kết quả mới.
      </Typography.Paragraph>
    </div>
  );
}

function StepActivity({ index, step }: { index: number; step: AgentStep }) {
  const [showIo, setShowIo] = useState(false);
  const output = normalizeOutput(step);
  const compact = isCompactStep(step);
  const tone = stepTone(step);
  const details = stepDetails(step);

  return (
    <div className={`agent-step-card ${tone}${compact ? " compact" : ""}`}>
      <div className="agent-step-header">
        <span className="agent-step-icon">{stepIcon(step)}</span>
        <div className="agent-step-heading">
          <Space size={8} wrap>
            <Tag className="step-index">Bước {index + 1}</Tag>
            <Tag className={`step-kind ${tone}`}>{stepKindLabel(step)}</Tag>
            <Typography.Text strong>{stepLabel(step)}</Typography.Text>
            <Button size="small" type={showIo ? "primary" : "default"} onClick={() => setShowIo(!showIo)}>
              I/O
            </Button>
          </Space>
          {details ? <Typography.Text className="step-detail">{details}</Typography.Text> : null}
          <Typography.Text type="secondary">{step.summary}</Typography.Text>
        </div>
      </div>
      {output ? <div className={compact ? "codex-step-output compact" : "codex-step-output"}>{output}</div> : null}
      {showIo ? <StepIoPanel step={step} /> : null}
    </div>
  );
}

function FinalAnswer({ message, run }: { message?: AgentMessage; run?: AgentRun }) {
  const answer = message?.content ?? answerFromRun(run);
  if (!answer) return null;

  return <MarkdownContent className="markdown-content codex-final-answer">{answer}</MarkdownContent>;
}

function FlowDiagramStep({ step }: { step: AgentStep }) {
  const diagram = step.data.diagram;

  return (
    <div className="agent-flow-card">
      <Space direction="vertical" size={10} className="full-width">
        <Space size={8}>
          <Tag className="step-index">Flow</Tag>
          <Typography.Text strong>Sơ đồ luồng đã chạy</Typography.Text>
        </Space>
        {typeof step.data.output === "string" ? (
          <MarkdownContent className="markdown-content step-output-text">{step.data.output}</MarkdownContent>
        ) : null}
        {typeof diagram === "string" ? <MermaidDiagram chart={diagram} /> : null}
      </Space>
    </div>
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

  if (step.kind === "document_search") {
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
  if (step.kind === "context") return "Đọc ngữ cảnh";
  if (step.kind === "plan") return "Lập plan";
  if (step.kind === "reasoning") return "Phân tích yêu cầu";
  if (step.kind === "decision") return "Chọn action";
  if (step.kind === "evaluation") return "Đánh giá tiến độ";
  if (step.kind === "document_search") return "Tìm tài liệu";
  if (step.kind === "artifact") return "Soạn bản nháp";
  if (step.kind === "clarification") return "Hỏi làm rõ";
  if (step.kind === "tool") return "Chạy công cụ";
  if (step.kind === "llm") return "Gọi model local";
  if (step.kind === "answer") return "Tổng hợp câu trả lời";
  if (step.kind === "flow") return "Vẽ sơ đồ luồng";
  if (step.kind === "error") return "Đã dừng";
  return step.title;
}

function stepKindLabel(step: AgentStep) {
  if (["document_search", "artifact", "tool"].includes(step.kind)) return "Tool";
  if (step.kind === "llm") return "AI model";
  if (step.kind === "decision") return "Decision";
  if (step.kind === "evaluation") return "Evaluation";
  if (step.kind === "answer") return "Final";
  if (step.kind === "flow") return "Flow";
  if (step.kind === "error") return "Error";
  return "Agent";
}

function stepTone(step: AgentStep) {
  if (["document_search", "artifact", "tool"].includes(step.kind)) return "tool";
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

function isCompactStep(step: AgentStep) {
  return ["decision", "evaluation"].includes(step.kind);
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
    <Descriptions
      size="small"
      column={1}
      className="model-metrics"
      items={[
        { key: "model", label: "Model", children: `${stringValue(data.provider, "ollama")} · ${stringValue(data.model, "-")}` },
        { key: "started", label: "Bắt đầu gọi", children: formatTime(data.request_started_at) },
        { key: "first", label: "Token đầu tiên", children: metricTime(data.first_token_at, data.first_token_latency_ms) },
        { key: "last", label: "Token cuối cùng", children: metricTime(data.last_token_at, data.last_token_latency_ms) },
        { key: "total", label: "Tổng thời gian", children: formatMs(metricNumber(data.total_duration_ms)) ?? "-" },
        { key: "chunks", label: "Stream chunks", children: String(data.streamed_chunks ?? "-") },
      ]}
    />
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
  const markdownOutput = typeof data.output === "string" && data.output.trim() ? data.output : null;

  return (
    <Space direction="vertical" size={8} className="full-width">
      {markdownOutput ? <MarkdownContent className="markdown-content step-output-text">{markdownOutput}</MarkdownContent> : null}

      {tools?.length ? (
        <Descriptions
          size="small"
          column={1}
          items={[{ key: "tools", label: "Công cụ", children: tools.join(", ") }]}
        />
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
    </Space>
  );
}
