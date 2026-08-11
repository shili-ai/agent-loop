import { ApiOutlined } from "@ant-design/icons";
import { Tag } from "antd";

type RunStatusTagProps = {
  status?: string;
};

export default function RunStatusTag({ status }: RunStatusTagProps) {
  const label = statusLabel(status);
  if (!label) return null;

  return (
    <Tag icon={<ApiOutlined />} color={statusColor(status)}>
      {label}
    </Tag>
  );
}

function statusColor(status?: string) {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  if (status === "cancelled") return "default";
  return "processing";
}

function statusLabel(status?: string) {
  if (status === "running") return "Đang chạy";
  if (status === "completed") return "Hoàn tất";
  if (status === "failed") return "Lỗi";
  if (status === "cancelled") return "Đã huỷ";
  return null;
}
