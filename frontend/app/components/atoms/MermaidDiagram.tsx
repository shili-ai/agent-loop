"use client";

import { useEffect, useId, useState } from "react";

type MermaidDiagramProps = {
  chart: string;
};

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const id = useId().replaceAll(":", "");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            primaryColor: "#eef7fa",
            primaryBorderColor: "#176b87",
            primaryTextColor: "#123744",
            lineColor: "#94a3b8",
            fontFamily: "var(--font-be-vietnam), Arial, sans-serif",
          },
        });
        const result = await mermaid.render(`agent-flow-${id}`, chart);
        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
        }
      } catch (renderError) {
        if (!cancelled) {
          setSvg("");
          setError(renderError instanceof Error ? renderError.message : "Không render được sơ đồ Mermaid.");
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return <pre className="mermaid-fallback">{chart}</pre>;
  }

  if (!svg) {
    return <div className="mermaid-loading">Đang vẽ sơ đồ...</div>;
  }

  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
