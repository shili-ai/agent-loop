import type { ComponentPropsWithoutRef, ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";

type MarkdownContentProps = {
  children: string;
  className?: string;
};

function extractText(node: unknown): string {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in (node as ReactElement)) {
    return extractText((node as ReactElement<{ children?: unknown }>).props.children);
  }
  return "";
}

const components: Components = {
  pre({ children }: ComponentPropsWithoutRef<"pre">) {
    const child = Array.isArray(children) ? children[0] : children;
    const codeProps =
      child && typeof child === "object" && "props" in child
        ? (child as ReactElement<{ className?: string; children?: unknown }>).props
        : undefined;
    const language = /language-([\w-]+)/.exec(codeProps?.className ?? "")?.[1];
    const code = extractText(codeProps?.children).replace(/\n$/, "");
    return <CodeBlock code={code} language={language} />;
  },
};

function normalizeMarkdown(markdown: string) {
  return markdown
    .trim()
    .replace(/^([ \t]{2,})(```[^\n]*\n)([\s\S]*?)^\1```[ \t]*$/gm, (_match, _indent, opening, body) => {
      const language = opening.replace(/^```/, "").trim();
      const fence = language ? `\`\`\`${language}` : "```";
      return `\n${fence}\n${body.trimEnd()}\n\`\`\``;
    });
}

export default function MarkdownContent({ children, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {normalizeMarkdown(children)}
      </ReactMarkdown>
    </div>
  );
}
