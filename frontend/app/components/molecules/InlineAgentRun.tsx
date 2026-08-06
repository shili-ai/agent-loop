import {
  BulbOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  RobotOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Collapse, Descriptions, List, Space, Typography } from "antd";
import type { ReactNode } from "react";
import type { AgentMessage, AgentRun, AgentStep } from "../../types/agent";

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
        <Typography.Text type="secondary">{runLabel(run, running, steps.length)}</Typography.Text>

        {steps.map((step) => <StepActivity key={step.id} step={step} />)}
        {running ? <PendingActivity hasSteps={steps.length > 0} /> : null}

        {!running ? <FinalAnswer message={finalAnswer} run={run} /> : null}
      </Space>
    </div>
  );
}

function runLabel(run: AgentRun | undefined, running: boolean, stepCount: number) {
  if (running) return stepCount ? `Working... ${stepCount} actions done` : "Working...";
  if (run?.status === "failed") return `Stopped after ${stepCount} actions`;
  if (run) return `Completed ${stepCount} actions`;
  return "Completed";
}

function PendingActivity({ hasSteps }: { hasSteps: boolean }) {
  return (
    <div className="codex-step">
      <Space size={8}>
        <LoadingOutlined />
        <Typography.Text type="secondary">{hasSteps ? "Continuing agent loop" : "Running agent loop"}</Typography.Text>
      </Space>
      <Typography.Paragraph className="codex-step-body">
        Agent đang xử lý tiếp và sẽ tự cập nhật ngay khi có kết quả mới.
      </Typography.Paragraph>
    </div>
  );
}

function StepActivity({ step }: { step: AgentStep }) {
  const output = normalizeOutput(step);

  return (
    <div className="codex-step">
      <Space size={8} className="codex-step-title">
        {stepIcon(step)}
        <Typography.Text type="secondary">{stepLabel(step)}</Typography.Text>
      </Space>
      <Typography.Paragraph className="codex-step-body">{step.summary}</Typography.Paragraph>
      {output ? <div className="codex-step-output">{output}</div> : null}
    </div>
  );
}

function FinalAnswer({ message, run }: { message?: AgentMessage; run?: AgentRun }) {
  const answer = message?.content ?? answerFromRun(run);
  if (!answer) return null;

  return <Typography.Paragraph className="codex-final-answer">{answer}</Typography.Paragraph>;
}

function answerFromRun(run?: AgentRun) {
  const answerStep = run?.steps.find((step) => step.kind === "answer");
  const output = answerStep?.data.output;
  return typeof output === "string" ? output : undefined;
}

function stepIcon(step: AgentStep) {
  if (step.kind === "context") return <FileSearchOutlined />;
  if (step.kind === "reasoning") return <BulbOutlined />;
  if (step.kind === "tool") return <ToolOutlined />;
  if (step.kind === "llm") return <RobotOutlined />;
  if (step.kind === "answer") return <CheckCircleOutlined />;
  if (step.kind === "error") return <CloseCircleOutlined />;
  return <CheckCircleOutlined />;
}

function stepLabel(step: AgentStep) {
  if (step.kind === "context") return "Read context";
  if (step.kind === "reasoning") return "Reasoned about request";
  if (step.kind === "tool") return "Ran tools";
  if (step.kind === "llm") return "Called local model";
  if (step.kind === "answer") return "Prepared final answer";
  if (step.kind === "error") return "Stopped";
  return step.title;
}

function normalizeOutput(step: AgentStep): ReactNode {
  if (step.kind === "answer") return null;
  if (step.kind === "tool") return <ToolOutput data={step.data} />;

  if (step.kind === "llm" && typeof step.data.output === "string" && step.data.output.trim()) {
    return (
      <Collapse
        ghost
        size="small"
        className="codex-output-collapse"
        items={[
          {
            key: "model-output",
            label: "Model draft",
            children: <Typography.Paragraph className="step-output-text">{step.data.output}</Typography.Paragraph>,
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

  return (
    <Space direction="vertical" size={8} className="full-width">
      {tools?.length ? (
        <Descriptions
          size="small"
          column={1}
          items={[{ key: "tools", label: "Tools", children: tools.join(", ") }]}
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
              label: `Documents found (${documents.length})`,
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
