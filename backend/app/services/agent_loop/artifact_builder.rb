module AgentLoop
  class ArtifactBuilder
    def initialize(intent:, documents:, message: nil)
      @intent = intent
      @documents = documents
      @message = message.to_s
    end

    def call
      {
        tool: tool_name,
        artifact: artifact,
        output: markdown_output
      }
    end

    private

    def tool_name
      return "markdown_table_builder" if table_request?

      case @intent
      when "battlecard" then "battlecard_builder"
      when "proposal" then "proposal_outline_builder"
      when "follow_up" then "follow_up_email_builder"
      when "rfp_answer" then "rfp_answer_drafter"
      else "presales_advisor"
      end
    end

    def artifact
      return @artifact if defined?(@artifact)

      @artifact =
      case @intent
      when ->(_intent) { table_request? } then markdown_table
      when "battlecard" then battlecard
      when "proposal" then proposal_outline
      when "follow_up" then follow_up_email
      when "rfp_answer" then rfp_answer
      else presales_advice
      end
    end

    def markdown_output
      return artifact[:content] if artifact[:content].present?

      lines = [ "### #{artifact[:title]}" ]
      artifact[:bullets].each { |bullet| lines << "- #{bullet}" }
      lines << ""
      lines << "**Nguồn:** #{artifact[:sources].join(', ')}"
      lines.join("\n")
    end

    def markdown_table
      {
        title: table_title,
        bullets: table_rows.map { |row| row[0] },
        content: table_content,
        sources: source_titles
      }
    end

    def table_content
      lines = [ "# #{table_title}", "" ]
      lines << "| Item | Feature | Effort (Man-day) | Remarks |"
      lines << "|---|---|---:|---|"
      table_rows.each { |row| lines << "| #{row.join(' | ')} |" }
      lines << ""
      lines << "**Total estimate:** khoảng **2.5-4 man-days** cho bản login Google cơ bản, tuỳ app đã có user/session hay chưa."
      lines << ""
      lines << "> Giả định: Rails app đã có database và môi trường dev/prod cơ bản; estimate chưa bao gồm phân quyền phức tạp hoặc SSO enterprise."
      lines.join("\n")
    end

    def table_title
      return "Estimate login Google bằng Rails" if normalized_message.match?(/login.*google|google.*login|dang nhap.*google|đăng nhập.*google/)

      "Bảng đề xuất"
    end

    def table_rows
      if normalized_message.match?(/login.*google|google.*login|dang nhap.*google|đăng nhập.*google/)
        [
          [ "1", "Google OAuth setup", "0.5", "Tạo OAuth Client, redirect URI và env vars." ],
          [ "2", "Rails backend integration", "1-1.5", "OmniAuth/Devise callback, find-or-create user." ],
          [ "3", "Session & security", "0.5-1", "Session/JWT, CSRF state, logout và error handling." ],
          [ "4", "UI & testing", "0.5-1", "Nút login, local/prod callback test và failure path." ]
        ]
      else
        [
          [ "1", "Scope clarification", "0.5", "Chốt yêu cầu và tiêu chí hoàn thành." ],
          [ "2", "Solution design", "0.5", "Phác thảo cấu trúc nội dung/luồng xử lý." ],
          [ "3", "Implementation", "1-2", "Tuỳ độ phức tạp và dependency." ],
          [ "4", "Review & handoff", "0.5", "Review, chỉnh sửa và hoàn thiện output." ]
        ]
      end
    end

    def battlecard
      {
        title: "Battlecard nhanh",
        bullets: [
          "Neo vào kết quả kinh doanh: rút ngắn thời gian phản hồi lead và tăng visibility pipeline.",
          "Điểm khác biệt: workflow presales gắn với tài liệu và template có nguồn.",
          "Câu hỏi phản biện: hệ thống hiện tại mất bao lâu để tạo proposal đúng ngữ cảnh?"
        ],
        sources: source_titles
      }
    end

    def proposal_outline
      {
        title: "Outline proposal",
        bullets: [
          "Executive summary theo pain point và mục tiêu mua hàng.",
          "Scope: discovery, tích hợp, workflow automation, enablement, rollout.",
          "Timeline 4 pha: assess, configure, pilot, scale.",
          "Assumptions và next steps để chốt meeting kỹ thuật."
        ],
        sources: source_titles
      }
    end

    def follow_up_email
      {
        title: "Email follow-up",
        bullets: [
          "Cảm ơn khách hàng về buổi discovery.",
          "Tóm tắt 2-3 pain point và liên kết với tài liệu liên quan.",
          "Đề xuất next step: workshop 30 phút về scope và success metrics."
        ],
        sources: source_titles
      }
    end

    def rfp_answer
      {
        title: "Bản nháp trả lời RFP",
        bullets: [
          "Trả lời ngắn gọn trước, sau đó thêm bằng chứng từ tài liệu.",
          "Đánh dấu giả định nếu câu hỏi thiếu thông tin deployment/security.",
          "Gắn mỗi claim với source để presales review nhanh."
        ],
        sources: source_titles
      }
    end

    def presales_advice
      {
        title: "Khuyến nghị presales",
        bullets: [
          "Làm rõ buyer pain, current process, timeline và decision criteria.",
          "Dùng case study/template gần nhất để tạo câu trả lời có bằng chứng.",
          "Nếu thiếu ngữ cảnh, hỏi lại về customer segment, product và deliverable mong muốn."
        ],
        sources: source_titles
      }
    end

    def source_titles
      @documents.map { |document| document[:title] }
    end

    def table_request?
      normalized_message.match?(/\b(table|bang|bảng)\b/) ||
        normalized_message.include?("lập bảng") ||
        normalized_message.include?("lap bang")
    end

    def normalized_message
      @normalized_message ||= @message.downcase
        .unicode_normalize(:nfkd)
        .gsub(/\p{Mn}/, "")
        .gsub("đ", "d")
    end
  end
end
