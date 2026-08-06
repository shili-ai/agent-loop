import { Button, Card, Space } from "antd";

const quickPrompts = [
  "Tim tai lieu va tao proposal cho CRM SaaS",
  "Lam battlecard so sanh voi doi thu cho sales automation",
  "Viet email follow-up sau buoi discovery ve security va rollout",
];

type QuickPromptsProps = {
  disabled: boolean;
  onSelect: (prompt: string) => void;
};

export default function QuickPrompts({ disabled, onSelect }: QuickPromptsProps) {
  return (
    <Card size="small" title="Quick prompts">
      <Space direction="vertical" className="full-width">
        {quickPrompts.map((prompt) => (
          <Button key={prompt} block onClick={() => onSelect(prompt)} disabled={disabled}>
            {prompt}
          </Button>
        ))}
      </Space>
    </Card>
  );
}
