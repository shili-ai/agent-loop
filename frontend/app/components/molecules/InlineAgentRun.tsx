import {
  BulbOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  RobotOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Collapse, Descriptions, List, Space, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import type { AgentMessage, AgentRun, AgentStep } from "../../types/agent";
import MarkdownContent from "../atoms/MarkdownContent";

type InlineAgentRunProps = {
  finalAnswer?: AgentMessage;
  pending?: boolean;
  run?: AgentRun;
};

export default function InlineAgentRun({ finalAnswer, pending = false, run }: InlineAgentRunProps) {
  const steps = run?.steps ?? [];
  const running = pending || run?.status === "running";

  return (
    <div className="codex-run">
      <Space direction="vertical" size={14} className="full-width">
        <div className="run-summary">
          <Space size={8}>
            {running ? <LoadingOutlined /> : <CheckCircleOutlined />}
            <Typography.Text strong>{runLabel(run, running, steps.length)}</Typography.Text>
          </Space>
        </div>

        {steps.map((step, index) => <StepActivity key={step.id} index={index} step={step} />)}
        {running ? <PendingActivity hasSteps={steps.length > 0} /> : null}

        {!running ? <FinalAnswer message={finalAnswer} run={run} /> : null}
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
  const output = normalizeOutput(step);
  const compact = isCompactStep(step);

  return (
    <div className={compact ? "agent-step-card compact" : "agent-step-card"}>
      <div className="agent-step-header">
        <span className="agent-step-icon">{stepIcon(step)}</span>
        <div className="agent-step-heading">
          <Space size={8} wrap>
            <Tag className="step-index">Bước {index + 1}</Tag>
            <Typography.Text strong>{stepLabel(step)}</Typography.Text>
          </Space>
          <Typography.Text type="secondary">{step.summary}</Typography.Text>
        </div>
      </div>
      {output ? <div className={compact ? "codex-step-output compact" : "codex-step-output"}>{output}</div> : null}
    </div>
  );
}

function FinalAnswer({ message, run }: { message?: AgentMessage; run?: AgentRun }) {
  const answer = message?.content ?? answerFromRun(run);
  if (!answer) return null;

  return <MarkdownContent className="markdown-content codex-final-answer">{answer}</MarkdownContent>;
}

function answerFromRun(run?: AgentRun) {
  const answerStep = run?.steps.find((step) => step.kind === "answer");
  const output = answerStep?.data.output;
  return typeof output === "string" ? output : undefined;
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
  if (step.kind === "error") return "Đã dừng";
  return step.title;
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
