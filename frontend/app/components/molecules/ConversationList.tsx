import { DeleteOutlined, MessageOutlined } from "@ant-design/icons";
import { Button, Empty, List, Popconfirm, Space, Typography } from "antd";
import type { AgentConversationSummary } from "../../types/agent";

type ConversationListProps = {
  activeId?: number;
  conversations: AgentConversationSummary[];
  loading: boolean;
  onDelete: (id: number) => void;
  onSelect: (id: number) => void;
};

export default function ConversationList({
  activeId,
  conversations,
  loading,
  onDelete,
  onSelect,
}: ConversationListProps) {
  return (
    <section className="sidebar-section conversation-section">
      <div className="sidebar-section-header">
        <Typography.Text className="sidebar-section-title">Chats trong project</Typography.Text>
      </div>
      {conversations.length ? (
        <List
          size="small"
          loading={loading}
          className="sidebar-conversation-list"
          dataSource={conversations}
          renderItem={(conversation) => (
            <List.Item
              className={conversation.id === activeId ? "conversation-item active" : "conversation-item"}
              onClick={() => onSelect(conversation.id)}
              actions={[
                <Popconfirm
                  key="delete"
                  title="Xoá chat này?"
                  description="Toàn bộ tin nhắn và lịch sử chạy agent của chat sẽ bị xoá."
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
              <Space align="center" className="conversation-title-row">
                <MessageOutlined />
                <Typography.Text ellipsis className="conversation-title">
                  {conversation.title}
                </Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      ) : (
        <Empty description="Chưa có chat nào" image={Empty.PRESENTED_IMAGE_SIMPLE} className="sidebar-empty" />
      )}
    </section>
  );
}
