import { FileSearchOutlined, RobotOutlined, UserOutlined } from "@ant-design/icons";
import { Avatar, Flex, List, Space, Typography } from "antd";
import type { AgentMessage } from "../../types/agent";
import MarkdownContent from "../atoms/MarkdownContent";

type MessageBubbleProps = {
  message: AgentMessage;
};

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <List.Item className={isUser ? "message-row user-message-row" : "message-row"}>
      <Flex gap={12} align="flex-start" className={isUser ? "message-flex reverse" : "message-flex"}>
        <Avatar
          icon={isUser ? <UserOutlined /> : <RobotOutlined />}
          className={isUser ? "user-avatar" : "agent-avatar"}
        />
        <div className={isUser ? "message-bubble user-bubble" : "message-bubble agent-bubble"}>
          <Space size={6} className="message-meta">
            {isUser ? <UserOutlined /> : <FileSearchOutlined />}
            <Typography.Text strong>{isUser ? "Bạn" : "Trợ lý"}</Typography.Text>
          </Space>
          <MarkdownContent className="markdown-content message-content">{message.content}</MarkdownContent>
        </div>
      </Flex>
    </List.Item>
  );
}
