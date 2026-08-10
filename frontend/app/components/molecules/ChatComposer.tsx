import { ArrowUpOutlined, PlusOutlined } from "@ant-design/icons";

type ChatComposerProps = {
  disabled: boolean;
  message: string;
  model: string;
  modelOptions: string[];
  sending: boolean;
  onChange: (message: string) => void;
  onChangeModel: (model: string) => void;
  onSend: () => void;
};

export default function ChatComposer({
  disabled,
  message,
  model,
  modelOptions,
  sending,
  onChange,
  onChangeModel,
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
        <select
          className="composer-model-select"
          value={model}
          disabled={disabled}
          aria-label="Chọn model"
          onChange={(event) => onChangeModel(event.target.value)}
        >
          {modelOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className={canSend || sending ? "composer-send active" : "composer-send"}
          disabled={!canSend}
          aria-label="Gửi"
        >
          <ArrowUpOutlined spin={sending} />
        </button>
      </form>
    </div>
  );
}
