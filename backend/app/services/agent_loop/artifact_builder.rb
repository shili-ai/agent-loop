require "csv"

module AgentLoop
  class ArtifactBuilder
    def initialize(intent:, documents:, message: nil, source_content: nil)
      @intent = intent
      @documents = documents
      @message = message.to_s
      @source_content = source_content.to_s
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
      return "csv_table_builder" if table_request?

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
      @artifact[:downloadable] = explicit_output_request?
      @artifact
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
      return comparison_markdown_table if comparison_table

      {
        title: table_title,
        bullets: table_rows.map { |row| row[0] },
        content: table_content,
        sections: table_sections,
        sources: source_titles,
        files: [ csv_file ]
      }
    end

    def table_content
      lines = [ "# #{table_title}", "" ]
      lines << "| Item | Feature | Effort (Man-day) | Remarks |"
      lines << "|---|---|---:|---|"
      table_sections.each { |section| lines << "| #{section[:item]} | #{section[:feature]} | #{section[:effort]} | #{section[:remarks]} |" }
      lines << ""
      lines << "**Total estimate:** khoảng **2.5-4 man-days** cho bản login Google cơ bản, tuỳ app đã có user/session hay chưa."
      lines << ""
      lines << "> Giả định: Rails app đã có database và môi trường dev/prod cơ bản; estimate chưa bao gồm phân quyền phức tạp hoặc SSO enterprise."
      lines.join("\n")
    end

    def comparison_markdown_table
      table = comparison_table
      {
        title: comparison_title(table[:headers]),
        bullets: table[:rows].map { |row| row.first },
        content: comparison_table_content(table),
        sources: source_titles,
        files: [ comparison_csv_file(table) ]
      }
    end

    def comparison_table_content(table)
      lines = [ "# #{comparison_title(table[:headers])}", "" ]
      lines << "| #{table[:headers].join(' | ')} |"
      lines << "|#{Array.new(table[:headers].length, '---').join('|')}|"
      table[:rows].each { |row| lines << "| #{row.join(' | ')} |" }
      lines.join("\n")
    end

    def table_sections
      @table_sections ||= table_rows.map do |item, feature, effort, remarks|
        {
          item: item,
          feature: feature,
          effort: effort,
          remarks: remarks
        }
      end
    end

    def csv_file
      {
        title: "#{table_title}.csv",
        name: "#{table_filename}.csv",
        mime: "text/csv;charset=utf-8",
        content: csv_content
      }
    end

    def csv_content
      CSV.generate do |csv|
        csv << [ "Item", "Feature", "Effort (Man-day)", "Remarks" ]
        table_sections.each do |section|
          csv << [ section[:item], section[:feature], section[:effort], section[:remarks] ]
        end
      end
    end

    def comparison_csv_file(table)
      {
        title: "#{comparison_title(table[:headers])}.csv",
        name: "#{comparison_filename(table[:headers])}.csv",
        mime: "text/csv;charset=utf-8",
        content: CSV.generate do |csv|
          csv << table[:headers]
          table[:rows].each { |row| csv << row }
        end
      }
    end

    # The assistant's previous answer is the authoritative source when a user
    # asks to export a comparison that was just shown in the conversation.
    def comparison_table
      return @comparison_table if defined?(@comparison_table)
      return @comparison_table = nil unless comparison_request?

      lines = @source_content.lines.map(&:strip)
      header_index = lines.each_index.find { |index| markdown_table_separator?(lines[index + 1]) }
      return @comparison_table = nil unless header_index

      headers = markdown_cells(lines[header_index])
      rows = lines[(header_index + 2)..].to_a.take_while { |line| line.start_with?("|") }
        .map { |line| markdown_cells(line) }
        .select { |row| row.length == headers.length && row.any?(&:present?) }
      @comparison_table = headers.length >= 2 && rows.any? ? { headers: headers, rows: rows } : nil
    end

    def comparison_request?
      normalized_message.match?(/\b(compare|comparison|so sanh)\b/) || normalized_message.include?("so sánh")
    end

    def markdown_table_separator?(line)
      line.to_s.strip.match?(/\A\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\z/)
    end

    def markdown_cells(line)
      line.to_s.strip.delete_prefix("|").delete_suffix("|").split("|").map(&:strip)
    end

    def comparison_title(headers)
      return "So sánh #{headers[1]} và #{headers[2]}" if headers.length >= 3

      "Bảng so sánh"
    end

    def comparison_filename(headers)
      comparison_title(headers).unicode_normalize(:nfkd)
        .gsub(/\p{Mn}/, "")
        .gsub("đ", "d")
        .gsub(/[^a-zA-Z0-9]+/, "-")
        .delete_prefix("-")
        .delete_suffix("-")
        .downcase
    end

    def table_title
      return "Estimate login Google bằng Rails" if normalized_message.match?(/login.*google|google.*login|dang nhap.*google|đăng nhập.*google/)

      "Bảng đề xuất"
    end

    def table_filename
      return "estimate-login-google-rails" if normalized_message.match?(/login.*google|google.*login|dang nhap.*google|đăng nhập.*google/)

      "bang-de-xuat"
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
        normalized_message.match?(/\b(csv|est|estimate)\b/) ||
        normalized_message.match?(/ước lượng|uoc luong/) ||
        normalized_message.include?("lập bảng") ||
        normalized_message.include?("lap bang")
    end

    def explicit_output_request?
      normalized_message.match?(/\b(csv|markdown|md|file|tep|tai lieu|document|est|estimate)\b/) ||
        normalized_message.match?(/ước lượng|uoc luong/) ||
        normalized_message.include?("tao file") ||
        normalized_message.include?("xuat file") ||
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
