module AgentLoop
  class ActionDecider
    def initialize(intent:, message:, state:, iteration:, max_iterations:)
      @intent = intent
      @message = message
      @state = state
      @iteration = iteration
      @max_iterations = max_iterations
    end

    def call
      return decision("final_answer", "Đã chạm giới hạn vòng lặp an toàn.") if @iteration >= @max_iterations
      return decision("search_documents", "Cần bằng chứng trước khi soạn nội dung.") if documents.empty?
      return decision("ask_clarification", "Yêu cầu còn ngắn, nên hỏi thêm ngữ cảnh.") if should_ask_clarification?
      return decision("draft_artifact", "Đã có tài liệu, cần tạo bản nháp để tổng hợp.") if should_draft?

      decision("final_answer", "Đã đủ dữ liệu để tổng hợp câu trả lời cuối.")
    end

    private

    def decision(action, reason)
      {
        action: action,
        reason: reason,
        output: "### Quyết định vòng #{@iteration}\n- Action: `#{action}`\n- Lý do: #{reason}"
      }
    end

    def documents
      @state[:documents] || []
    end

    def should_draft?
      @intent != "document_search" && @state[:artifact].nil?
    end

    def should_ask_clarification?
      @message.split.length < 8 && !@state[:clarification] && @state[:artifact].nil?
    end
  end
end
