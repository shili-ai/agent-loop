import { Card } from "antd";

type ErrorNoticeProps = {
  message: string | null;
};

export default function ErrorNotice({ message }: ErrorNoticeProps) {
  if (!message) return null;

  return <Card className="error-card">{message}</Card>;
}
