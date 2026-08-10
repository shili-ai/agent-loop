import { Suspense, type ReactNode } from "react";
import AgentChat from "../components/AgentChat";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense>
        <AgentChat />
      </Suspense>
      {children}
    </>
  );
}
