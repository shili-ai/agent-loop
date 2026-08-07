import { ConfigProvider, Layout, theme } from "antd";
import type { ReactNode } from "react";

type AgentChatTemplateProps = {
  chatPanel: ReactNode;
  errorNotice: ReactNode;
  newConversationModal: ReactNode;
  sidebar: ReactNode;
};

export default function AgentChatTemplate({
  chatPanel,
  errorNotice,
  newConversationModal,
  sidebar,
}: AgentChatTemplateProps) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 8,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontSize: 13,
        },
      }}
    >
      <Layout className="agent-shell">
        {sidebar}
        <Layout.Content className="agent-content">
          <div className="main-chat-stack">
            {errorNotice}
            {chatPanel}
          </div>
        </Layout.Content>
        {newConversationModal}
      </Layout>
    </ConfigProvider>
  );
}
