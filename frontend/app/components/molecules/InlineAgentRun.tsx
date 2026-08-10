"use client";

import {
  BulbOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  RightOutlined,
  RobotOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Space } from "antd";
import { useState } from "react";
import { collectRunOutputs, triggerLibraryDownload, type LibraryItem } from "../../lib/conversationLibrary";
import type { AgentMessage, AgentRun, AgentStep } from "../../types/agent";
import MarkdownContent from "../atoms/MarkdownContent";
import MessageActions from "../atoms/MessageActions";

type InlineAgentRunProps = {
  finalAnswer?: AgentMessage;
  onOpenLibraryItem?: (item: LibraryItem) => void;
  pending?: boolean;
  run?: AgentRun;
};

export default function InlineAgentRun({ finalAnswer, onOpenLibraryItem, pending = false, run }: InlineAgentRunProps) {
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

        {!running ? <FinalAnswer message={finalAnswer} onOpenLibraryItem={onOpenLibraryItem} run={run} /> : null}
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
        <StepResultPreview step={step} />
        {showDetail ? <StepIoPanel step={step} /> : null}
      </div>
    </div>
  );
}

function StepResultPreview({ step }: { step: AgentStep }) {
  if (step.kind === "web_search") {
    const rawResults = asRecords(step.data.web_raw_results);
    const results = asRecords(step.data.web_results);

    return (
      <div className="step-result-preview">
        {rawResults.length ? <StepResultGroup items={rawResults} title="Link tìm được" /> : null}
        {results.length ? <StepResultGroup items={results} title="Kết quả đạt chuẩn" /> : null}
        {!rawResults.length && !results.length ? (
          <div className="step-result-empty">Search provider chưa trả về kết quả phù hợp để hiển thị.</div>
        ) : null}
      </div>
    );
  }

  if (step.kind === "document_search") {
    const documents = asRecords(step.data.documents);
    if (!documents.length) return null;

    return (
      <div className="step-result-preview">
        <StepResultGroup items={documents} title="Tài liệu tìm được" />
      </div>
    );
  }

  return null;
}

function StepResultGroup({ items, title }: { items: Record<string, unknown>[]; title: string }) {
  return (
    <div className="step-result-group">
      <div className="step-result-title">{title}</div>
      <ul className="step-result-list">
        {items.slice(0, 5).map((item, index) => (
          <li key={`${asText(item.title) || asText(item.url) || index}-${index}`}>
            <span className="step-result-name">{asText(item.title) || asText(item.url) || "Không có tiêu đề"}</span>
            {asText(item.reason) ? <span className="step-result-reason"> · {asText(item.reason)}</span> : null}
            {asText(item.url) ? <span className="step-result-url"> · {asText(item.url)}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FinalAnswer({
  message,
  onOpenLibraryItem,
  run,
}: {
  message?: AgentMessage;
  onOpenLibraryItem?: (item: LibraryItem) => void;
  run?: AgentRun;
}) {
  const answer = message?.content ?? answerFromRun(run);
  const outputs = collectRunOutputs(run);
  if (!answer) return null;

  return (
    <section className="final-answer-section">
      <MarkdownContent className="markdown-content codex-final-answer">{answer}</MarkdownContent>
      {outputs.length ? (
        <div className="assistant-output-cards">
          {outputs.map((item) => (
            <button
              type="button"
              className="assistant-output-card"
              key={item.key}
              onClick={() => onOpenLibraryItem?.(item)}
            >
              <span className="assistant-output-card-icon">
                <FileTextOutlined />
              </span>
              <span className="assistant-output-card-copy">
                <span className="assistant-output-card-title">{item.title}</span>
                <span className="assistant-output-card-detail">{item.detail || "Tài liệu"}</span>
              </span>
              <span
                className="assistant-output-card-download"
                role="button"
                tabIndex={0}
                title="Tải xuống"
                onClick={(event) => {
                  event.stopPropagation();
                  triggerLibraryDownload(item);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  triggerLibraryDownload(item);
                }}
              >
                <DownloadOutlined />
              </span>
            </button>
          ))}
        </div>
      ) : null}
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
  const metadata = stepMetadata(step);
  const input = stepInput(step);
  const output = stepOutput(step);

  return (
    <div className="step-io-panel">
      {metadata.length ? (
        <div className="step-detail-grid">
          {metadata.map((item) => (
            <div className={item.wide ? "step-detail-item wide" : "step-detail-item"} key={item.label}>
              <span className="step-detail-label">{item.label}</span>
              <span className="step-detail-value">{item.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="step-io-sections">
        <StepDataSection title="Input" data={input} />
        {output ? <StepDataSection title="Output" data={output} /> : null}
      </div>
    </div>
  );
}

function StepDataSection({
  data,
  title,
}: {
  data: { content: string };
  title: string;
}) {
  return (
    <section className="step-data-section">
      <div className="step-data-title">{title}</div>
      <pre className="step-detail-code">{data.content}</pre>
    </section>
  );
}

function stepMetadata(step: AgentStep) {
  const data = step.data;
  const items: { label: string; value: string; wide?: boolean }[] = [];
  const addItem = (label: string, value: unknown, wide = false) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text) return;
    items.push({ label, value: text, wide });
  };

  addItem("Bước", step.title);
  addItem("Loại", step.kind);

  if (step.kind === "llm") {
    addItem("Provider", data.provider);
    addItem("Model", data.model);
    addItem("Trạng thái", data.status);
    addItem("Thời gian", formatMs(data.total_duration_ms));
    addItem("Token đầu", formatMs(data.first_token_latency_ms));
  }

  if (step.kind === "decision") {
    addItem("Vòng", data.iteration);
    addItem("Action", data.action);
    addItem("Nguồn", data.source);
    addItem("Lý do", data.reason, true);
  }

  if (step.kind === "document_search" || step.kind === "web_search") {
    addItem("Công cụ", Array.isArray(data.tools) ? data.tools.join(", ") : data.tools);
    addItem("Từ khoá", Array.isArray(data.keywords) ? data.keywords.join(", ") : data.query);
  }

  if (step.kind === "artifact") {
    addItem("Công cụ", Array.isArray(data.tools) ? data.tools.join(", ") : data.tools);
    addItem("Tài liệu", artifactTitle(data.artifact));
  }

  return items;
}

function stepInput(step: AgentStep): { content: string } {
  const data = step.data;
  const base = { kind: step.kind, title: step.title, summary: step.summary };

  if (step.kind === "llm") {
    return {
      content: JSON.stringify(
        {
          ...base,
          provider: data.provider,
          model: data.model,
          status: data.status,
          request_started_at: data.request_started_at,
        },
        null,
        2
      ),
    };
  }

  if (step.kind === "decision") {
    return {
      content: JSON.stringify(
        {
          ...base,
          iteration: data.iteration,
          action: data.action,
          reason: data.reason,
          source: data.source,
        },
        null,
        2
      ),
    };
  }

  if (step.kind === "document_search" || step.kind === "web_search") {
    return {
      content: JSON.stringify(
        {
          ...base,
          tools: data.tools,
          query: data.query,
          keywords: data.keywords,
        },
        null,
        2
      ),
    };
  }

  if (step.kind === "artifact") {
    return {
      content: JSON.stringify(
        {
          ...base,
          tools: data.tools,
          artifact_title: artifactTitle(data.artifact),
        },
        null,
        2
      ),
    };
  }

  return { content: JSON.stringify(base, null, 2) };
}

function stepOutput(step: AgentStep): { content: string } | null {
  const data = step.data ?? {};
  if (typeof data.output === "string" && data.output.trim()) {
    return { content: data.output };
  }

  const compact = Object.fromEntries(
    Object.entries(data).filter(([key]) => !["output", "raw", "diagram"].includes(key))
  );
  if (!Object.keys(compact).length) return null;

  return { content: JSON.stringify(compact, null, 2) };
}

function formatMs(value: unknown) {
  if (typeof value !== "number") return value;
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
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
