import { ArrowUpOutlined, CloudOutlined, DatabaseOutlined, FileAddOutlined, PlusOutlined } from "@ant-design/icons";
import { Dropdown } from "antd";
import { useRef } from "react";

type ChatComposerProps = {
  disabled: boolean;
  message: string;
  model: string;
  modelOptions: string[];
  sending: boolean;
  uploadingDocument?: boolean;
  onChange: (message: string) => void;
  onChangeModel: (model: string) => void;
  onSend: () => void;
  onUploadDocument?: (file: File) => void;
};

export default function ChatComposer({
  disabled,
  message,
  model,
  modelOptions,
  sending,
  uploadingDocument = false,
  onChange,
  onChangeModel,
  onSend,
  onUploadDocument,
}: ChatComposerProps) {
  const canSend = Boolean(message.trim()) && !disabled;
  const canUpload = Boolean(onUploadDocument) && !uploadingDocument;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addMenu = {
    items: [
      {
        key: "upload",
        label: uploadingDocument ? "Đang tải file..." : "Tải file lên",
        icon: <FileAddOutlined />,
        disabled: !canUpload,
      },
      {
        key: "drive",
        label: "Google Drive",
        icon: <CloudOutlined />,
      },
      {
        key: "mcp",
        label: "MCP / nguồn ngoài",
        icon: <DatabaseOutlined />,
        disabled: true,
      },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "upload" && canUpload) fileInputRef.current?.click();
      if (key === "drive") window.location.href = "/connectors";
    },
  };

  return (
    <div className="composer-dock">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) onSend();
        }}
      >
        <Dropdown menu={addMenu} trigger={["click"]} placement="topLeft">
          <button type="button" className="composer-attach" title="Thêm nguồn" aria-label="Thêm nguồn">
            <PlusOutlined />
          </button>
        </Dropdown>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden-file-input"
          disabled={!canUpload}
          accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.yaml,.yml,.log"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file && onUploadDocument) onUploadDocument(file);
          }}
        />
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
