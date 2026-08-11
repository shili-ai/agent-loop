module AgentLoop
  class ActionDecider
    def initialize(intent:, message:, state:, iteration:, max_iterations:, context: {})
      @intent = intent
      @message = message
      @state = state
      @iteration = iteration
      @max_iterations = max_iterations
      @context = context
    end

    def call
      return decision("final_answer", "Đã chạm giới hạn vòng lặp an toàn.") if @iteration >= @max_iterations
      return decision("revise_artifact", "Bản nháp chưa đạt kiểm tra, cần sửa trước khi trả lời cuối.") if latest_artifact_status == "needs_revision"
      return decision("verify_artifact", "Đã có bản nháp nhưng chưa kiểm tra.") if artifact_present? && latest_artifact_status != "verified"
      return decision("final_answer", "Bản nháp đã qua kiểm tra.") if latest_artifact_status == "verified"
      return decision("web_search", "Yêu cầu cần thông tin trên web.") if should_search_web?
      return decision("final_answer", "Đã có kết quả web để tổng hợp.") if @intent == "web_search" && web_results.present?
      return decision("final_answer", "Đã thử tìm web nhưng không có nguồn đáng tin phù hợp.") if empty_web_search_done?
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

    def web_results
      @state[:web_results] || []
    end

    def should_search_web?
      return false if web_results.present? || @state[:web_attempts].to_i.positive?

      @intent == "web_search" || @message.downcase.match?(/web|internet|online|google|tin mới|mới nhất|hiện nay|thị trường|đối thủ|website/)
    end

    def empty_web_search_done?
      @intent == "web_search" && @state[:web_attempts].to_i.positive? && web_results.blank?
    end

    def should_draft?
      @intent != "document_search" && @state[:artifact].nil?
    end

    def artifact_present?
      @state[:artifact].present?
    end

    def latest_artifact_status
      latest_artifact = Array(@state[:artifacts]).last
      latest_artifact&.dig(:status) || latest_artifact&.dig("status")
    end

    def should_ask_clarification?
      return false if answered_clarification?

      @message.split.length < 8 && !@state[:clarification] && @state[:artifact].nil?
    end

    def answered_clarification?
      @message.downcase.include?("bổ sung ngữ cảnh:") || recent_user_messages.any? do |message|
        message.to_s.downcase.start_with?("bổ sung ngữ cảnh:")
      end
    end

    def recent_user_messages
      Array(@context[:recent_messages]).filter_map do |message|
        role = message[:role] || message["role"]
        next unless role == "user"

        message[:content] || message["content"]
      end
    end
  end
end
