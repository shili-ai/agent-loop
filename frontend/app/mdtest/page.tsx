import MarkdownContent from "../components/atoms/MarkdownContent";

const sample = [
  "Đây là kết quả:",
  "",
  "```tsv",
  "ID\tCategory\tDescription",
  "Databricks-01\tDatabricks\tKiểm tra dữ liệu import",
  "Databricks-02\tDatabricks\tKiểm tra nội dung file",
  "```",
  "",
  "Và một đoạn `inline code` nữa.",
].join("\n");

export default function MdTestPage() {
  return (
    <div style={{ maxWidth: 768, margin: "40px auto", padding: 20 }}>
      <MarkdownContent className="markdown-content">{sample}</MarkdownContent>
    </div>
  );
}
