module AgentLoop
  class LoopPlanBuilder
    def initialize(intent:, message:)
      @intent = intent
      @message = message
    end

    def call
      {
        goal: goal,
        actions: actions,
        output: markdown_output
      }
    end

    private

    def goal
      case @intent
      when "proposal" then "Chuẩn bị nội dung proposal có dẫn chứng."
      when "battlecard" then "Tạo battlecard ngắn để hỗ trợ trao đổi với khách."
      when "follow_up" then "Soạn email follow-up dựa trên ngữ cảnh và tài liệu liên quan."
      when "rfp_answer" then "Draft câu trả lời RFP/RFI có bằng chứng."
      when "document_search" then "Tìm và tóm tắt tài liệu phù hợp."
      else "Đưa ra khuyến nghị presales thực dụng."
      end
    end

    def actions
      base = ["search_documents"]
      base << "web_search" if needs_web_search?
      base << "draft_artifact" unless @intent == "document_search"
      base << "ask_clarification" if needs_clarification?
      base << "final_answer"
      base
    end

    def needs_clarification?
      @message.split.length < 8
    end

    def needs_web_search?
      @message.downcase.match?(/web|internet|online|google|tin mới|mới nhất|hiện nay|thị trường|đối thủ|website/)
    end

    def markdown_output
      lines = ["### Plan ngắn", "- Mục tiêu: #{goal}", "- Action dự kiến:"]
      actions.each { |action| lines << "  - `#{action}`" }
      lines.join("\n")
    end
  end
end
