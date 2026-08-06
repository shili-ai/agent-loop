import { ApiOutlined } from "@ant-design/icons";
import { Tag } from "antd";

type RunStatusTagProps = {
  status?: string;
};

export default function RunStatusTag({ status }: RunStatusTagProps) {
  const label = statusLabel(status);

  return (
    <Tag icon={<ApiOutlined />} color={status === "completed" ? "success" : "processing"}>
      {label}
    </Tag>
  );
}

function statusLabel(status?: string) {
  if (status === "running") return "Đang chạy";
  if (status === "completed") return "Hoàn tất";
  if (status === "failed") return "Lỗi";
  return "Sẵn sàng";
}
