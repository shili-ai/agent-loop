module AgentLoop
  class ClarificationBuilder
    # Mỗi câu hỏi có type "choice" (chọn từ options, cho phép nhập "Khác")
    # hoặc "text" (nhập tự do). Frontend render dạng form giống AskUserQuestion.
    QUESTIONS = [
      {
        id: "output_type",
        question: "Bạn muốn output cuối là gì?",
        type: "choice",
        options: ["Email follow-up", "Proposal", "Battlecard", "Câu trả lời RFP/RFI"]
      },
      {
        id: "customer",
        question: "Khách hàng thuộc segment nào và pain point chính là gì?",
        type: "text"
      },
      {
        id: "focus",
        question: "Có sản phẩm/module cụ thể nào cần nhấn mạnh không?",
        type: "text"
      }
    ].freeze

    def initialize(message:)
      @message = message
    end

    def call
      {
        questions: QUESTIONS,
        output: markdown_output
      }
    end

    private

    def markdown_output
      lines = ["### Cần làm rõ thêm", "Yêu cầu hiện tại khá ngắn: \"#{@message.truncate(100)}\"", "", "Agent sẽ hỏi:"]
      QUESTIONS.each { |question| lines << "- #{question[:question]}" }
      lines.join("\n")
    end
  end
end
