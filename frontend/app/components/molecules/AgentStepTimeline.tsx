import { Card, Empty, Space, Tag, Timeline, Typography } from "antd";
import type { AgentRun } from "../../types/agent";

type AgentStepTimelineProps = {
  run?: AgentRun;
};

export default function AgentStepTimeline({ run }: AgentStepTimelineProps) {
  return (
    <Card className="steps-panel" title="Agent loop">
      {run ? (
        <Timeline
          items={run.steps.map((step) => ({
            color: step.kind === "tool" ? "blue" : step.kind === "answer" ? "green" : "gray",
            children: (
              <Space direction="vertical" size={2}>
                <Typography.Text strong>
                  {step.position}. {step.title}
                </Typography.Text>
                <Typography.Text type="secondary">{step.summary}</Typography.Text>
                <Tag>{step.kind}</Tag>
              </Space>
            ),
          }))}
        />
      ) : (
        <Empty description="Chua co run nao" />
      )}
    </Card>
  );
}
