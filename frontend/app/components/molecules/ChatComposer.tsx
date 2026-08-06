import { SendOutlined } from "@ant-design/icons";
import { Button, Form, Input } from "antd";

type ChatComposerProps = {
  disabled: boolean;
  message: string;
  sending: boolean;
  onChange: (message: string) => void;
  onSend: () => void;
};

export default function ChatComposer({
  disabled,
  message,
  sending,
  onChange,
  onSend,
}: ChatComposerProps) {
  return (
    <Form className="composer" onFinish={onSend}>
      <Input.TextArea
        value={message}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Vi du: Tim tai lieu ve SaaS security va tao email follow-up cho khach enterprise"
        autoSize={{ minRows: 2, maxRows: 4 }}
        disabled={disabled}
        onPressEnter={(event) => {
          if (!event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      <Button
        type="primary"
        htmlType="submit"
        icon={<SendOutlined />}
        loading={sending}
        disabled={!message.trim() || disabled}
      >
        Send
      </Button>
    </Form>
  );
}
