import { ArrowUpOutlined, PlusOutlined } from "@ant-design/icons";

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
  const canSend = Boolean(message.trim()) && !disabled;

  return (
    <div className="composer-dock">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) onSend();
        }}
      >
        <button type="button" className="composer-attach" title="Đính kèm (sắp có)" disabled>
          <PlusOutlined />
        </button>
        <div className="composer-input-wrap" data-replicated-value={message}>
          <textarea
            className="composer-input"
            value={message}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Làm với bất kỳ nội dung nào"
            rows={1}
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSend) onSend();
              }
            }}
          />
        </div>
        <button
          type="submit"
          className={canSend || sending ? "composer-send active" : "composer-send"}
          disabled={!canSend}
          aria-label="Gửi"
        >
          <ArrowUpOutlined spin={sending} />
        </button>
      </form>
      <p className="composer-hint">Trợ lý có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.</p>
    </div>
  );
}
