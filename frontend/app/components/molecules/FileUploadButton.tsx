"use client";

import { UploadOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";

type FileUploadButtonProps = {
  className?: string;
  disabled?: boolean;
  label?: string;
  title: string;
  onUpload: (file: File) => void;
};

export default function FileUploadButton({
  className = "chat-tool-btn",
  disabled = false,
  label,
  title,
  onUpload,
}: FileUploadButtonProps) {
  return (
    <Tooltip title={title}>
      <label
        className={disabled ? `${className} disabled` : className}
        aria-label={title}
        aria-disabled={disabled}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.currentTarget.querySelector("input")?.click();
        }}
      >
        <UploadOutlined />
        {label ? <span>{label}</span> : null}
        <input
          type="file"
          className="hidden-file-input"
          disabled={disabled}
          accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.yaml,.yml,.log"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onUpload(file);
          }}
        />
      </label>
    </Tooltip>
  );
}
