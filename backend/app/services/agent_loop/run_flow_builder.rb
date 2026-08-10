module AgentLoop
  class RunFlowBuilder
    LABELS = {
      "context" => "Đọc ngữ cảnh",
      "reasoning" => "Phân tích yêu cầu",
      "plan" => "Lập plan",
      "decision" => "Chọn action",
      "document_search" => "Tìm tài liệu",
      "web_search" => "Tìm trên web",
      "web_read" => "Đọc trang web",
      "artifact" => "Soạn bản nháp",
      "clarification" => "Hỏi làm rõ",
      "evaluation" => "Đánh giá",
      "llm" => "Gọi model",
      "answer" => "Trả lời cuối",
      "error" => "Lỗi"
    }.freeze

    def initialize(run:)
      @run = run
    end

    def call
      steps = @run.agent_steps.order(:position).reject { |step| step.kind == "flow" }
      {
        diagram: diagram(steps),
        output: "### Sơ đồ luồng đã chạy\nAgent đã đi qua #{steps.count} bước trước khi hoàn tất câu trả lời."
      }
    end

    private

    def diagram(steps)
      lines = [ "flowchart TD" ]
      steps.each_with_index do |step, index|
        lines << "  #{node_id(index)}[\"#{node_label(step, index)}\"]"
        lines << "  #{node_id(index - 1)} --> #{node_id(index)}" if index.positive?
      end
      lines.join("\n")
    end

    def node_id(index)
      "S#{index + 1}"
    end

    def node_label(step, index)
      label = LABELS.fetch(step.kind, step.title)
      "#{index + 1}. #{escape(label)}"
    end

    def escape(text)
      text.to_s.gsub("\"", "'")
    end
  end
end
