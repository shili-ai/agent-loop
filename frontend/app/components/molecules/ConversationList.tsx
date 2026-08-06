import { DeleteOutlined, MessageOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Card, Empty, List, Popconfirm, Space, Typography } from "antd";
import type { AgentConversationSummary } from "../../types/agent";

type ConversationListProps = {
  activeId?: number;
  conversations: AgentConversationSummary[];
  loading: boolean;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onSelect: (id: number) => void;
};

export default function ConversationList({
  activeId,
  conversations,
  loading,
  onCreate,
  onDelete,
  onSelect,
}: ConversationListProps) {
  return (
    <Card
      size="small"
      title="Chats"
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onCreate}>
          New
        </Button>
      }
    >
      {conversations.length ? (
        <List
          loading={loading}
          dataSource={conversations}
          renderItem={(conversation) => (
            <List.Item
              className={conversation.id === activeId ? "conversation-item active" : "conversation-item"}
              onClick={() => onSelect(conversation.id)}
              actions={[
                <Popconfirm
                  key="delete"
                  title="Xoá chat này?"
                  description="Toàn bộ messages và agent runs của chat sẽ bị xoá."
                  okText="Xoá"
                  cancelText="Huỷ"
                  okButtonProps={{ danger: true }}
                  onConfirm={(event) => {
                    event?.stopPropagation();
                    onDelete(conversation.id);
                  }}
                  onCancel={(event) => event?.stopPropagation()}
                >
                  <Button
                    danger
                    size="small"
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={(event) => event.stopPropagation()}
                  />
                </Popconfirm>,
              ]}
            >
              <Space align="start">
                <MessageOutlined />
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{conversation.title}</Typography.Text>
                  <Typography.Text type="secondary">
                    {conversation.customer_name || "No customer"} · {conversation.industry}
                  </Typography.Text>
                </Space>
              </Space>
            </List.Item>
          )}
        />
      ) : (
        <Empty description="Chua co chat nao" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Card>
  );
}
