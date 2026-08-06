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
        placeholder="Ví dụ: Tìm tài liệu về bảo mật SaaS và tạo email follow-up cho khách enterprise"
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
        Gửi
      </Button>
    </Form>
  );
}
