import { Card, Space, Typography } from "antd";
import type { AgentConversation } from "../../types/agent";

type WorkspaceCardProps = {
  conversation: AgentConversation | null;
};

export default function WorkspaceCard({ conversation }: WorkspaceCardProps) {
  return (
    <Card size="small" title="Workspace">
      <Space direction="vertical" size={6}>
        <Typography.Text strong>{conversation?.title ?? "No chat selected"}</Typography.Text>
        <Typography.Text type="secondary">Industry: {conversation?.industry ?? "-"}</Typography.Text>
        <Typography.Text type="secondary">Customer: {conversation?.customer_name ?? "-"}</Typography.Text>
      </Space>
    </Card>
  );
}
