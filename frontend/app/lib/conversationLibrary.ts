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
  const library = collectLibraryFromRuns(conversation.runs);
  conversation.documents?.forEach((document) => {
    library.sources.push({
      key: `source:document:uploaded:${document.id}`,
      kind: "document",
      title: document.title,
      detail: document.agent_conversation_id ? "Tài liệu chat" : "Tài liệu project",
      name: `${slugify(document.title) || "tai-lieu"}.md`,
      content: documentMarkdown(document.title, document.content_preview, document.filename),
      mime: "text/markdown;charset=utf-8",
    });
  });
  return library;
}

export function collectRunOutputs(run?: AgentRun): LibraryItem[] {
  return collectLibraryFromRuns(run ? [run] : []).outputs;
}

function collectLibraryFromRuns(runs: AgentRun[]): ConversationLibrary {
  const outputs: LibraryItem[] = [];
  const sources: LibraryItem[] = [];
  const seen = new Set<string>();

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

      asArray(data.web_results).forEach((result) => {
        const item = asRecord(result);
        const url = asString(item.url);
        if (!url) return;

        push(sources, {
          kind: "web",
          title: asString(item.title),
          detail: url,
          url,
        });
      });

      const artifact = asRecord(data.artifact);
      const artifactTitle = asString(artifact.title);
      const output = asString(data.output);
      if (artifactTitle && output) {
        const files = asArray(artifact.files).map(asRecord).filter((file) => asString(file.content));
        if (files.length) {
          files.forEach((file) => {
            const name = asString(file.name) || `${slugify(asString(file.title) || artifactTitle) || "ket-qua"}.txt`;
            push(outputs, {
              kind: "artifact",
              title: asString(file.title) || name,
              detail: outputDetail(name, asString(file.mime)),
              name,
              content: asString(file.content),
              mime: asString(file.mime) || mimeFromName(name),
            });
          });
        } else {
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
      }

      // Sơ đồ luồng giờ render trực tiếp bằng React Flow, không xuất file md nữa.
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

function outputDetail(name: string, mime: string) {
  if (mime.includes("csv") || name.toLowerCase().endsWith(".csv")) return "CSV · Bảng dữ liệu";
  if (mime.includes("markdown") || name.toLowerCase().endsWith(".md")) return "Markdown";
  return "Tài liệu";
}

function mimeFromName(name: string) {
  if (name.toLowerCase().endsWith(".csv")) return "text/csv;charset=utf-8";
  if (name.toLowerCase().endsWith(".md")) return "text/markdown;charset=utf-8";
  return "text/plain;charset=utf-8";
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
