import { ConfigProvider, Layout, theme } from "antd";
import type { ReactNode } from "react";
import AgentStepTimeline from "../molecules/AgentStepTimeline";
import type { AgentRun } from "../../types/agent";

type AgentChatTemplateProps = {
  chatPanel: ReactNode;
  errorNotice: ReactNode;
  latestRun?: AgentRun;
  newConversationModal: ReactNode;
  sidebar: ReactNode;
};

export default function AgentChatTemplate({
  chatPanel,
  errorNotice,
  latestRun,
  newConversationModal,
  sidebar,
}: AgentChatTemplateProps) {
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
        {sidebar}
        <Layout.Content className="agent-content">
          <div className="main-chat-stack">
            {errorNotice}
            {chatPanel}
          </div>
          <AgentStepTimeline run={latestRun} />
        </Layout.Content>
        {newConversationModal}
      </Layout>
    </ConfigProvider>
  );
}
