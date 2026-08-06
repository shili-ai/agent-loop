module AgentLoop
  class LoopEvaluator
    def initialize(intent:, state:, last_action:)
      @intent = intent
      @state = state
      @last_action = last_action
    end

    def call
      {
        done: done?,
        reason: reason,
        output: markdown_output
      }
    end

    private

    def done?
      return true if @last_action == "ask_clarification"
      return documents.any? if @intent == "document_search"

      documents.any? && artifact.present?
    end

    def reason
      return "Đã có câu hỏi làm rõ để gửi lại người dùng." if @last_action == "ask_clarification"
      return "Đã có tài liệu phù hợp để trả lời." if @intent == "document_search" && documents.any?
      return "Đã có tài liệu và bản nháp để tổng hợp." if documents.any? && artifact.present?
      return "Đã có tài liệu nhưng chưa có bản nháp." if documents.any?

      "Chưa có đủ dữ liệu để tổng hợp."
    end

    def markdown_output
      <<~MARKDOWN.strip
        ### Đánh giá sau action
        - Đã đủ để kết thúc: **#{done? ? "Có" : "Chưa"}**
        - Lý do: #{reason}
      MARKDOWN
    end

    def documents
      @state[:documents] || []
    end

    def artifact
      @state[:artifact]
    end
  end
end
