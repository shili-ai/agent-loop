"use client";

import {
  Avatar,
  Button,
  Card,
  ConfigProvider,
  Empty,
  Flex,
  Form,
  Input,
  Layout,
  List,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
  theme,
} from "antd";
import {
  ApiOutlined,
  FileSearchOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";

type AgentMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type AgentStep = {
  id: number;
  position: number;
  kind: string;
  title: string;
  summary: string;
  data: Record<string, unknown>;
};

type AgentRun = {
  id: number;
  status: string;
  intent: string | null;
  user_message_id: number;
  assistant_message_id: number | null;
  steps: AgentStep[];
};

type AgentConversation = {
  id: number;
  title: string;
  industry: string;
  customer_name: string | null;
  messages: AgentMessage[];
  runs: AgentRun[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const quickPrompts = [
  "Tim tai lieu va tao proposal cho CRM SaaS",
  "Lam battlecard so sanh voi doi thu cho sales automation",
  "Viet email follow-up sau buoi discovery ve security va rollout",
];

export default function AgentChat() {
  const [conversation, setConversation] = useState<AgentConversation | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestRun = useMemo(() => conversation?.runs.at(-1), [conversation]);

  const bootstrapConversation = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const conversationsResponse = await fetch(`${API_URL}/api/agent_conversations`);
      const conversations = await conversationsResponse.json();
      const existing = conversations[0];

      if (existing) {
        const response = await fetch(`${API_URL}/api/agent_conversations/${existing.id}`);
        setConversation(await response.json());
        return;
      }

      const response = await fetch(`${API_URL}/api/agent_conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_conversation: {
            title: "Presales workspace",
            industry: "software",
            customer_name: "Demo customer",
          },
        }),
      });
      setConversation(await response.json());
    } catch {
      setError("Khong ket noi duoc Rails API. Kiem tra backend port va NEXT_PUBLIC_API_URL.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    bootstrapConversation();
  }, [bootstrapConversation]);

  async function sendMessage(value = message) {
    if (!conversation || !value.trim()) return;

    setSending(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/agent_conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { content: value.trim() } }),
      });

      if (!response.ok) throw new Error("Request failed");

      setConversation(await response.json());
      setMessage("");
    } catch {
      setError("Agent loop bi loi khi xu ly message. Thu lai hoac xem log backend.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#176b87",
          borderRadius: 8,
          fontFamily: "var(--font-geist-sans), Arial, sans-serif",
        },
      }}
    >
      <Layout className="agent-shell">
        <Layout.Sider width={320} className="agent-sidebar" theme="light">
          <Flex vertical gap={18}>
            <div>
              <Typography.Title level={3} className="agent-title">
                Presales Agent
              </Typography.Title>
              <Typography.Text type="secondary">
                Rails agent loop with dummy tools
              </Typography.Text>
            </div>

            <Card size="small" title="Workspace">
              <Space direction="vertical" size={6}>
                <Typography.Text strong>{conversation?.title ?? "Loading"}</Typography.Text>
                <Typography.Text type="secondary">Industry: {conversation?.industry ?? "software"}</Typography.Text>
                <Typography.Text type="secondary">
                  Customer: {conversation?.customer_name ?? "Demo customer"}
                </Typography.Text>
              </Space>
            </Card>

            <Card size="small" title="Quick prompts">
              <Space direction="vertical" className="full-width">
                {quickPrompts.map((prompt) => (
                  <Button key={prompt} block onClick={() => sendMessage(prompt)} disabled={sending || loading}>
                    {prompt}
                  </Button>
                ))}
              </Space>
            </Card>
          </Flex>
        </Layout.Sider>

        <Layout.Content className="agent-content">
          <div className="chat-column">
            <Flex justify="space-between" align="center" className="chat-header">
              <div>
                <Typography.Title level={4}>Agent chat</Typography.Title>
                <Typography.Text type="secondary">
                  Ask for documents, proposal outlines, battlecards, RFP answers, or follow-up emails.
                </Typography.Text>
              </div>
              <Tag icon={<ApiOutlined />} color={latestRun?.status === "completed" ? "success" : "processing"}>
                {latestRun?.status ?? "ready"}
              </Tag>
            </Flex>

            {error && <Card className="error-card">{error}</Card>}

            <Card className="messages-card">
              {loading ? (
                <Flex justify="center" align="center" className="empty-state">
                  <Spin />
                </Flex>
              ) : conversation?.messages.length ? (
                <List
                  dataSource={conversation.messages}
                  renderItem={(item) => <MessageBubble message={item} />}
                />
              ) : (
                <Empty description="Gui message dau tien de chay agent loop" />
              )}
            </Card>

            <Form
              className="composer"
              onFinish={() => sendMessage()}
            >
              <Input.TextArea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Vi du: Tim tai lieu ve SaaS security va tao email follow-up cho khach enterprise"
                autoSize={{ minRows: 2, maxRows: 4 }}
                disabled={sending || loading}
                onPressEnter={(event) => {
                  if (!event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button
                type="primary"
                htmlType="submit"
                icon={<SendOutlined />}
                loading={sending}
                disabled={!message.trim() || loading}
              >
                Send
              </Button>
            </Form>
          </div>

          <Card className="steps-panel" title="Agent loop">
            {latestRun ? (
              <Timeline
                items={latestRun.steps.map((step) => ({
                  color: step.kind === "tool" ? "blue" : step.kind === "answer" ? "green" : "gray",
                  children: (
                    <Space direction="vertical" size={2}>
                      <Typography.Text strong>{step.position}. {step.title}</Typography.Text>
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
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  );
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === "user";

  return (
    <List.Item className={isUser ? "message-row user-message-row" : "message-row"}>
      <Flex gap={12} align="flex-start" className={isUser ? "message-flex reverse" : "message-flex"}>
        <Avatar icon={isUser ? <UserOutlined /> : <RobotOutlined />} className={isUser ? "user-avatar" : "agent-avatar"} />
        <div className={isUser ? "message-bubble user-bubble" : "message-bubble agent-bubble"}>
          <Space size={6} className="message-meta">
            {isUser ? <UserOutlined /> : <FileSearchOutlined />}
            <Typography.Text strong>{isUser ? "You" : "Agent"}</Typography.Text>
          </Space>
          <Typography.Paragraph className="message-content">
            {message.content}
          </Typography.Paragraph>
        </div>
      </Flex>
    </List.Item>
  );
}
