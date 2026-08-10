import type { AgentConversation, AgentRun } from "../types/agent";

export type LibraryItem = {
  key: string;
  kind: "document" | "web" | "artifact" | "flow";
  title: string;
  detail?: string;
  name?: string;
  content?: string;
  mime?: string;
  url?: string;
};

export type ConversationLibrary = {
  outputs: LibraryItem[];
  sources: LibraryItem[];
};

export function collectConversationLibrary(conversation: AgentConversation): ConversationLibrary {
  return collectLibraryFromRuns(conversation.runs);
}

export function collectRunOutputs(run?: AgentRun): LibraryItem[] {
  return collectLibraryFromRuns(run ? [run] : []).outputs;
}

function collectLibraryFromRuns(runs: AgentRun[]): ConversationLibrary {
  const outputs: LibraryItem[] = [];
  const sources: LibraryItem[] = [];
  const seen = new Set<string>();
  let flowIndex = 0;

  const push = (bucket: LibraryItem[], item: Omit<LibraryItem, "key">) => {
    const cleanTitle = item.title.trim();
    if (!cleanTitle) return;
    const key = `${bucket === outputs ? "output" : "source"}:${item.kind}:${item.name || item.url || cleanTitle}`;
    if (seen.has(key)) return;
    seen.add(key);
    bucket.push({ ...item, key, title: cleanTitle });
  };

  runs.forEach((run) => {
    run.steps.forEach((step) => {
      const data = step.data ?? {};

      asArray(data.documents).forEach((document) => {
        const item = asRecord(document);
        const title = asString(item.title);
        const snippet = asString(item.snippet);
        const source = asString(item.source);
        push(sources, {
          kind: "document",
          title,
          detail: asString(item.type) || source || undefined,
          name: `${slugify(title) || "tai-lieu"}.md`,
          content: documentMarkdown(title, snippet, source),
          mime: "text/markdown;charset=utf-8",
        });
      });

      asArray(data.web_results).forEach((result) => {
        const item = asRecord(result);
        push(sources, {
          kind: "web",
          title: asString(item.title),
          detail: asString(item.source) || asString(item.url) || undefined,
          url: asString(item.url) || undefined,
        });
      });

      const artifact = asRecord(data.artifact);
      const artifactTitle = asString(artifact.title);
      const output = asString(data.output);
      if (artifactTitle && output) {
        const bullets = asArray(artifact.bullets);
        push(outputs, {
          kind: "artifact",
          title: `${artifactTitle}.md`,
          detail: bullets.length ? `Tài liệu · ${bullets.length} ý` : "Tài liệu",
          name: `${slugify(artifactTitle) || "ket-qua"}.md`,
          content: output,
          mime: "text/markdown;charset=utf-8",
        });
      }

      if (step.kind === "flow") {
        const diagram = asString(data.diagram);
        if (diagram) {
          flowIndex += 1;
          const suffix = flowIndex > 1 ? `-${flowIndex}` : "";
          push(outputs, {
            kind: "flow",
            title: `so-do-luong${suffix}.md`,
            detail: "Tài liệu",
            name: `so-do-luong${suffix}.md`,
            content: `\`\`\`mermaid\n${diagram.trim()}\n\`\`\`\n`,
            mime: "text/markdown;charset=utf-8",
          });
        }
      }
    });
  });

  return { outputs, sources };
}

function documentMarkdown(title: string, snippet: string, source: string) {
  const lines = [`# ${title}`];
  if (snippet) lines.push("", snippet);
  if (source) lines.push("", `Nguồn: ${source}`);
  return `${lines.join("\n")}\n`;
}

export function triggerLibraryDownload(item: LibraryItem) {
  if (!item.content || !item.name) return;

  const blob = new Blob([item.content], { type: item.mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = item.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
