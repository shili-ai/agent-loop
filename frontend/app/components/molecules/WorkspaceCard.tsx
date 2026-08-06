import { Card, Space, Typography } from "antd";
import type { AgentConversation } from "../../types/agent";

type WorkspaceCardProps = {
  conversation: AgentConversation | null;
};

export default function WorkspaceCard({ conversation }: WorkspaceCardProps) {
  return (
    <Card size="small" title="Không gian làm việc">
      <Space direction="vertical" size={6}>
        <Typography.Text strong>{conversation?.title ?? "Chưa chọn chat"}</Typography.Text>
        <Typography.Text type="secondary">Ngành: {conversation?.industry ?? "-"}</Typography.Text>
        <Typography.Text type="secondary">Khách hàng: {conversation?.customer_name ?? "-"}</Typography.Text>
      </Space>
    </Card>
  );
}
