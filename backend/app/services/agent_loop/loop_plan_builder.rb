module AgentLoop
  class LoopPlanBuilder
    def initialize(intent:, message:)
      @intent = intent
      @message = message
    end

    def call
      built_steps = steps
      {
        goal: goal,
        steps: built_steps,
        actions: built_steps.map { |step| step[:action] },
        output: markdown_output(built_steps)
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

    def steps
      list = []
      if needs_clarification?
        list << step("ask_clarification", "Hỏi lại để làm rõ",
          "Yêu cầu còn ngắn/thiếu ngữ cảnh nên mình hỏi lại phạm vi trước khi dùng tool.",
          "Người dùng xác nhận rõ phạm vi cần xử lý.")
      end

      list << step("search_documents", "Tra kho tài liệu nội bộ",
        "Mình tra kho tài liệu đã upload/project để tìm dẫn chứng cho yêu cầu này.",
        "Tìm được tài liệu liên quan hoặc xác nhận không có nguồn nội bộ.")

      if needs_web_search?
        list << step("web_search", "Tìm thông tin trên web",
          "Yêu cầu cần dữ kiện mới/ngoài kho nội bộ nên mình tìm thêm trên web.",
          "Có nguồn web đạt chuẩn hoặc xác nhận không có nguồn phù hợp.")
      end

      if artifact_requested?
        list << step("draft_artifact", "Soạn bản nháp",
          "Mình soạn bản nháp #{artifact_kind} dựa trên tài liệu và ngữ cảnh đã thu thập.",
          "Có bản nháp đủ cấu trúc theo yêu cầu.")
        list << step("verify_artifact", "Kiểm tra bản nháp",
          "Mình kiểm tra bản nháp về cấu trúc, nội dung, nguồn và tính đúng yêu cầu.",
          "Bản nháp đạt chuẩn hoặc chỉ ra điểm cần sửa.")
      end

      list << step("final_answer", "Tổng hợp câu trả lời cuối",
        "Mình tổng hợp ngữ cảnh, tài liệu và bản nháp thành câu trả lời hoàn chỉnh.",
        "Câu trả lời bám yêu cầu, chỉ dùng bằng chứng đã có.")
      list
    end

    def artifact_kind
      case @intent
      when "proposal" then "proposal"
      when "battlecard" then "battlecard"
      when "follow_up" then "email follow-up"
      when "rfp_answer" then "câu trả lời RFP/RFI"
      else "tài liệu"
      end
    end

    def artifact_requested?
      return true if %w[proposal battlecard follow_up rfp_answer].include?(@intent)

      normalized = @message.to_s.downcase
        .unicode_normalize(:nfkd)
        .gsub(/\p{Mn}/, "")
        .gsub("đ", "d")
      normalized.match?(/\b(csv|markdown|md|file|tep|tai lieu|document|est|estimate)\b/) ||
        normalized.match?(/ước lượng|uoc luong/) ||
        normalized.include?("tao file") ||
        normalized.include?("xuat file") ||
        normalized.include?("lap bang")
    end

    def step(action, title, detail, expected)
      { action: action, title: title, detail: detail, expected: expected }
    end

    def needs_clarification?
      @message.split.length < 8
    end

    def needs_web_search?
      @message.downcase.match?(/web|internet|online|google|tin mới|mới nhất|hiện nay|thị trường|đối thủ|website/)
    end

    def markdown_output(steps)
      lines = [ "### Plan ngắn", "- Mục tiêu: #{goal}", "- Kế hoạch chi tiết:" ]
      steps.each_with_index do |step, index|
        lines << "  #{index + 1}. **#{step[:title]}** (`#{step[:action]}`)"
        lines << "     - Làm gì: #{step[:detail]}"
        lines << "     - Mong đợi: #{step[:expected]}" if step[:expected]
      end
      lines.join("\n")
    end
  end
end
