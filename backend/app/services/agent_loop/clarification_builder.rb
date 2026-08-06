module AgentLoop
  class ClarificationBuilder
    QUESTIONS = [
      "Bạn muốn output cuối là email, proposal, battlecard hay câu trả lời RFP?",
      "Khách hàng thuộc segment nào và đang gặp pain point chính là gì?",
      "Có sản phẩm/module cụ thể nào cần nhấn mạnh không?"
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
      QUESTIONS.each { |question| lines << "- #{question}" }
      lines.join("\n")
    end
  end
end
