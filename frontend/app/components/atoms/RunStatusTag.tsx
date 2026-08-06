import { ApiOutlined } from "@ant-design/icons";
import { Tag } from "antd";

type RunStatusTagProps = {
  status?: string;
};

export default function RunStatusTag({ status }: RunStatusTagProps) {
  return (
    <Tag icon={<ApiOutlined />} color={status === "completed" ? "success" : "processing"}>
      {status ?? "ready"}
    </Tag>
  );
}
