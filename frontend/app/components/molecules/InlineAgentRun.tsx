"use client";

import {
  BulbOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
  FileSearchOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LoadingOutlined,
  RightOutlined,
  RobotOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Segmented, Space } from "antd";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { collectRunOutputs, triggerLibraryDownload, type LibraryItem } from "../../lib/conversationLibrary";
import { buildRunFlowGraph } from "../../lib/runFlowGraph";
import type { AgentMessage, AgentRun, AgentStep } from "../../types/agent";
import MarkdownContent from "../atoms/MarkdownContent";
import MessageActions from "../atoms/MessageActions";
import RunFlowGraph from "./RunFlowGraph";

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
  const blocked =
    !running &&
    (run?.status === "failed" || run?.status === "cancelled" || visibleSteps.some((step) => step.kind === "clarification"));
  // Dựng sơ đồ LIVE từ các bước đã stream về (không chờ step "flow" ở cuối run).
  const [flowNow, setFlowNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;

    const timer = window.setInterval(() => setFlowNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const flowGraph = visibleSteps.length ? buildRunFlowGraph(visibleSteps, { running, blocked, now: flowNow }) : null;
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"trace" | "flow">("flow");
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [insets, setInsets] = useState<{ top: number; bottom: number }>({ top: 0, bottom: 0 });
  const showSteps = running || expanded;

  useEffect(() => {
    if (!fullscreen) return;
    // Chặn overlay đúng khoảng giữa: dưới header, trên ô nhập chat.
    const column = document.querySelector(".chat-column");
    const header = column?.querySelector(".chat-header");
    const composer = column?.querySelector(".composer-dock");
    const measure = () =>
      setInsets({
        top: header ? header.getBoundingClientRect().height : 0,
        bottom: composer ? composer.getBoundingClientRect().height : 0,
      });
    measure();
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    if (composer) observer.observe(composer);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

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
          <div className="run-trace-container">
            {flowGraph ? (
              <div className="run-view-bar">
                <Segmented
                  size="small"
                  value={viewMode}
                  onChange={(value) => setViewMode(value as "trace" | "flow")}
                  options={[
                    { label: "Truyền thống", value: "trace" },
                    { label: "Sơ đồ", value: "flow" },
                  ]}
                />
                {viewMode === "flow" ? (
                  <button type="button" className="run-flow-fs-btn" onClick={() => setFullscreen(true)}>
                    <FullscreenOutlined /> Phóng to
                  </button>
                ) : null}
              </div>
            ) : null}
            {viewMode === "flow" && flowGraph ? (
              <div className="run-flow-pane">
                <RunFlowGraph
                  edges={flowGraph.edges}
                  nodes={flowGraph.nodes}
                  onSelectStep={(index) => setSelectedStepIndex((current) => (current === index ? null : index))}
                  selectedStepIndex={selectedStepIndex}
                />
              </div>
            ) : (
              <div className="run-steps">
                {visibleSteps.map((step) => <StepActivity key={step.id} step={step} />)}
                {running ? <PendingActivity /> : null}
              </div>
            )}
          </div>
        ) : null}

        {!running ? <FinalAnswer message={finalAnswer} onOpenLibraryItem={onOpenLibraryItem} run={run} /> : null}
      </Space>

      {fullscreen && flowGraph && typeof document !== "undefined" && document.querySelector(".chat-column")
        ? createPortal(
            <div
              className="run-flow-overlay"
              role="dialog"
              aria-modal="true"
              style={{ top: insets.top, bottom: insets.bottom }}
            >
              <RunFlowGraph
                edges={flowGraph.edges}
                nodes={flowGraph.nodes}
                onSelectStep={(index) => setSelectedStepIndex((current) => (current === index ? null : index))}
                selectedStepIndex={selectedStepIndex}
              />
              <div className="run-flow-overlay-bar bottom">
                <span className="run-flow-overlay-title">Sơ đồ luồng</span>
                <button type="button" className="run-flow-fs-btn" onClick={() => setFullscreen(false)}>
                  <FullscreenExitOutlined /> Thu nhỏ (Esc)
                </button>
              </div>
            </div>,
            document.querySelector(".chat-column") as Element
          )
        : null}
    </div>
  );
}

function runLabel(run: AgentRun | undefined, running: boolean, stepCount: number) {
  if (running) return stepCount ? `Đang suy luận… (${stepCount} bước)` : "Đang suy luận…";
  if (run?.status === "cancelled") return stepCount ? `Đã huỷ sau ${stepCount} bước` : "Đã huỷ lượt chạy";
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
  const [now, setNow] = useState(() => Date.now());
  const tone = stepTone(step);
  const text = reasoningText(step);
  const running = asText(step.data.status) === "running";
  const runtime = running ? runningStepRuntime(step, now) : null;

  useEffect(() => {
    if (!running) return;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

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
        {runtime ? <div className={runtime.stale ? "reason-runtime stale" : "reason-runtime"}>{runtime.label}</div> : null}
        {text ? <div className="reason-text">{text}</div> : null}
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

  if (step.kind === "web_read") {
    const pages = asRecords(step.data.pages);
    const pendingResults = asRecords(step.data.results);
    if (!pages.length && !pendingResults.length) return null;

    return (
      <div className="step-result-preview">
        <WebPageReadGroup pages={pages} pendingResults={pendingResults} />
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

  if (step.kind === "plan") {
    const planSteps = asRecords(step.data.steps);
    if (!planSteps.length) return null;

    return (
      <div className="step-result-preview">
        <PlanStepsGroup steps={planSteps} />
      </div>
    );
  }

  if (step.kind === "retrieval") {
    const documents = asRecords(step.data.documents);
    const internal = documents.filter((doc) => !isDriveDoc(doc));
    const drive = documents.filter(isDriveDoc);
    const webResults = asRecords(step.data.web_results);
    const pages = asRecords(step.data.pages);

    return (
      <div className="step-result-preview">
        {internal.length ? <StepResultGroup items={internal} title="Tài liệu nội bộ" /> : null}
        {drive.length ? <StepResultGroup items={drive} title="Google Drive" /> : null}
        {webResults.length ? (
          <StepResultGroup items={webResults} title="Kết quả web đạt chuẩn" />
        ) : (
          <WebEmptyGroup raw={asRecords(step.data.web_raw_results)} candidates={asRecords(step.data.web_candidates)} />
        )}
        {pages.length ? (
          <WebPageReadGroup pages={pages} />
        ) : null}
      </div>
    );
  }

  if (step.kind === "verification") {
    const checks = asRecords(step.data.checks);
    if (!checks.length) return null;

    return (
      <div className="step-result-preview">
        <div className="step-result-group">
          <div className="step-result-title">Checklist</div>
          <ul className="step-result-list">
            {checks.map((check, index) => (
              <li key={`${asText(check.label) || index}-${index}`}>
                <span className="step-result-name">{check.passed ? "OK" : "Cần sửa"} · {asText(check.label)}</span>
                {asText(check.message) ? <span className="step-result-reason"> · {asText(check.message)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return null;
}

function WebPageReadGroup({
  pages,
  pendingResults = [],
}: {
  pages: Record<string, unknown>[];
  pendingResults?: Record<string, unknown>[];
}) {
  const crawled = pages.length ? pages : pendingResults;

  return (
    <div className="step-result-group">
      <div className="step-result-title">Link crawler {pages.length ? "đã trả về" : "đang chờ đọc"}</div>
      <div className="step-read-pages">
        {crawled.map((page, index) => (
          <article className="step-read-page" key={`${asText(page.title) || asText(page.url) || index}-${index}`}>
            <div className="step-read-page-head">
              <span className="step-result-name">{asText(page.title) || asText(page.url) || "Không có tiêu đề"}</span>
              {asText(page.requested_url) || asText(page.url) ? (
                <a
                  className="step-result-url"
                  href={asText(page.requested_url) || asText(page.url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {asText(page.requested_url) || asText(page.url)}
                </a>
              ) : null}
            </div>
            {asText(page.requested_url) && asText(page.url) && asText(page.requested_url) !== asText(page.url) ? (
              <a className="step-result-url step-result-redirect-url" href={asText(page.url)} target="_blank" rel="noreferrer">
                Sau redirect: {asText(page.url)}
              </a>
            ) : null}
            {asText(page.status) ? <div className="step-read-status">Trạng thái crawler: {asText(page.status)}</div> : null}
            {asText(page.error) ? <div className="step-result-empty">Không đọc được: {asText(page.error)}</div> : null}
            {asText(page.content) ? <pre className="step-read-content">{truncateText(asText(page.content), 900)}</pre> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function PlanStepsGroup({ steps }: { steps: Record<string, unknown>[] }) {
  return (
    <div className="step-result-group">
      <div className="step-result-title">Các bước dự kiến</div>
      <ol className="step-result-list">
        {steps.map((planStep, index) => (
          <li key={`${asText(planStep.title) || asText(planStep.action) || index}-${index}`}>
            <span className="step-result-name">{asText(planStep.title) || asText(planStep.action) || `Bước ${index + 1}`}</span>
            {asText(planStep.detail) ? <span className="step-result-reason"> · {asText(planStep.detail)}</span> : null}
            {asText(planStep.expected) ? <span className="step-result-url"> · Mong đợi: {asText(planStep.expected)}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function WebEmptyGroup({ candidates, raw }: { candidates: Record<string, unknown>[]; raw: Record<string, unknown>[] }) {
  const reasons = Array.from(new Set(candidates.map((candidate) => asText(candidate.reason)).filter(Boolean))).slice(0, 3);

  return (
    <div className="step-result-group">
      <div className="step-result-title">Kết quả web</div>
      {raw.length ? (
        <>
          <div className="step-result-empty">0/{raw.length} kết quả đạt chuẩn.</div>
          {reasons.length ? (
            <ul className="step-result-list">
              {reasons.map((reason, index) => (
                <li key={`${reason}-${index}`}>
                  <span className="step-result-reason">Loại: {reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <div className="step-result-empty">Search provider không trả về kết quả thô nào.</div>
      )}
    </div>
  );
}

function isDriveDoc(doc: Record<string, unknown>): boolean {
  const source = asText(doc.source);
  return source.startsWith("drive://") || asText(doc.type) === "google_drive" || asText(doc.search_provider) === "drive";
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
      <StepResultPreview step={step} />
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
  addItem("Trạng thái", data.status);
  addItem("Bắt đầu", data.request_started_at || step.created_at);
  addItem("Cập nhật", step.updated_at);

  if (step.kind === "llm") {
    addItem("Provider", data.provider);
    addItem("Model", data.model);
    addItem("Prompt layers", promptLayerSummary(data.prompt_layers), true);
    addItem("Thời gian", formatMs(data.total_duration_ms));
    addItem("Token đầu", formatMs(data.first_token_latency_ms));
  }

  if (step.kind === "decision") {
    addItem("Vòng", data.iteration);
    addItem("Action", data.action);
    addItem("Nguồn", data.source);
    addItem("Lý do", data.reason, true);
    addItem("Prompt layers", promptLayerSummary(data.prompt_layers), true);
  }

  if (step.kind === "document_search" || step.kind === "web_search" || step.kind === "web_read") {
    addItem("Công cụ", Array.isArray(data.tools) ? data.tools.join(", ") : data.tools);
    addItem("Từ khoá", Array.isArray(data.keywords) ? data.keywords.join(", ") : data.query);
  }

  if (step.kind === "retrieval") {
    addItem("Công cụ", Array.isArray(data.tools) ? data.tools.join(", ") : data.tools, true);
    addItem("Từ khoá", Array.isArray(data.keywords) ? data.keywords.join(", ") : data.query, true);
    addItem("Thử lại từ khoá", data.reformulated_query, true);
  }

  if (step.kind === "plan") {
    addItem("Mục tiêu", data.goal, true);
    addItem("Từ khoá", Array.isArray(data.keywords) ? data.keywords.join(", ") : undefined, true);
    addItem("Số bước", Array.isArray(data.steps) ? data.steps.length : undefined);
  }

  if (data.derived_from === "model_analysis") {
    addItem("Nguồn", "Tách từ lượt gọi model phân tích ở trên (không gọi lại model)", true);
  }

  if (step.kind === "artifact") {
    addItem("Công cụ", Array.isArray(data.tools) ? data.tools.join(", ") : data.tools);
    addItem("Tài liệu", artifactTitle(data.artifact));
  }

  if (step.kind === "verification") {
    addItem("Trạng thái", data.status);
    addItem("Số check", Array.isArray(data.checks) ? data.checks.length : undefined);
  }

  return items;
}

function stepInput(step: AgentStep): { content: string } {
  const data = step.data;
  const base = { kind: step.kind, title: step.title, summary: step.summary };

  if (Array.isArray(data.prompt_messages)) {
    return { content: promptMessagesToText(data.prompt_messages) };
  }

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

  if (step.kind === "document_search" || step.kind === "web_search" || step.kind === "web_read") {
    return {
      content: JSON.stringify(
        {
          ...base,
          tools: data.tools,
          query: data.query,
          keywords: data.keywords,
          pages: data.pages,
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

  if (step.kind === "verification") {
    return {
      content: JSON.stringify(
        {
          ...base,
          status: data.status,
          checks: data.checks,
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

function runningStepRuntime(step: AgentStep, now: number): { label: string; stale: boolean } | null {
  const startedAt = asText(step.data.request_started_at) || step.created_at;
  if (!startedAt) return null;

  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) return null;

  const elapsedSeconds = Math.max(0, Math.floor((now - startedMs) / 1000));
  const stale = elapsedSeconds >= 60;
  return {
    label: stale ? `Có thể đã kẹt · ${formatDuration(elapsedSeconds)}` : `Đang chạy · ${formatDuration(elapsedSeconds)}`,
    stale,
  };
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function promptLayerSummary(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as { active_skills?: unknown; has_project_prompt?: unknown; has_chat_prompt?: unknown };
  const skills = asRecords(record.active_skills)
    .map((skill) => {
      const name = asText(skill.name) || asText(skill.key);
      const scope = asText(skill.scope);
      return [name, scope ? `(${scope})` : ""].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  const bits = [];
  if (skills.length) bits.push(`Skills: ${skills.join(", ")}`);
  if (record.has_project_prompt) bits.push("Project prompt");
  if (record.has_chat_prompt) bits.push("Chat prompt");
  return bits.join(" · ");
}

function promptMessagesToText(messages: unknown[]) {
  return messages
    .map((message, index) => {
      if (!message || typeof message !== "object") return `#${index + 1}\n${String(message)}`;
      const item = message as { role?: unknown; content?: unknown };
      return [`#${index + 1} role: ${String(item.role ?? "unknown")}`, "", String(item.content ?? "")].join("\n");
    })
    .join("\n\n---\n\n");
}

function truncateText(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
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
  if (step.kind === "retrieval") return <FileSearchOutlined />;
  if (step.kind === "document_search") return <FileSearchOutlined />;
  if (step.kind === "web_search") return <FileSearchOutlined />;
  if (step.kind === "web_read") return <FileTextOutlined />;
  if (step.kind === "artifact") return <ToolOutlined />;
  if (step.kind === "verification") return <CheckCircleOutlined />;
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
  if (step.kind === "retrieval") return "Tìm nguồn song song";
  if (step.kind === "document_search") return "Tìm tài liệu liên quan";
  if (step.kind === "web_search") return "Tra cứu trên web";
  if (step.kind === "web_read") return "Đọc trang web";
  if (step.kind === "artifact") return "Soạn bản nháp";
  if (step.kind === "verification") return "Kiểm tra bản nháp";
  if (step.kind === "clarification") return "Đặt câu hỏi làm rõ";
  if (step.kind === "tool") return "Dùng công cụ";
  if (step.kind === "llm") return "Suy nghĩ với model";
  if (step.kind === "answer") return "Tổng hợp câu trả lời";
  if (step.kind === "error") return "Đã dừng";
  return step.title;
}

function stepTone(step: AgentStep) {
  if (["retrieval", "document_search", "web_search", "web_read", "artifact", "verification", "tool"].includes(step.kind)) return "tool";
  if (step.kind === "llm") return "model";
  if (["decision", "evaluation", "plan", "reasoning"].includes(step.kind)) return "thinking";
  if (step.kind === "answer") return "final";
  if (step.kind === "error") return "error";
  return "agent";
}
