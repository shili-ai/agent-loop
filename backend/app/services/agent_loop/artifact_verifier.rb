module AgentLoop
  class ArtifactVerifier
    ESTIMATE_HEADER = "| Item | Feature | Effort (Man-day) | Remarks |".freeze

    def initialize(artifact:, message:)
      @artifact = artifact || {}
      @message = message.to_s
    end

    def call
      checks = [
        check("Có tiêu đề", title_present?, "Artifact cần có title hoặc heading Markdown."),
        check("Có nội dung", content_present?, "Artifact không được rỗng."),
        check("Không có nguồn giả", no_fake_sources?, "Nguồn phải lấy từ tài liệu/web thực sự, không dùng placeholder."),
        *table_checks
      ]
      status = checks.all? { |item| item[:passed] } ? "verified" : "needs_revision"

      {
        status: status,
        checks: checks,
        summary: summary(status, checks),
        output: markdown(status, checks)
      }
    end

    private

    def table_checks
      return [] unless table_request?

      [
        check("Đúng header bảng estimate", content.include?(ESTIMATE_HEADER), "Bảng estimate phải có 4 cột: Item, Feature, Effort (Man-day), Remarks."),
        check("Có ít nhất một dòng dữ liệu", table_data_rows.positive?, "Bảng cần có ít nhất một item estimate."),
        check("Mỗi dòng đúng 4 cột", table_rows_have_four_columns?, "Mỗi dòng estimate phải có đúng 4 cột để render thành bảng.")
      ]
    end

    def check(label, passed, message)
      {
        label: label,
        passed: !!passed,
        message: passed ? "OK" : message
      }
    end

    def title_present?
      @artifact[:title].to_s.strip.present? || content.lines.any? { |line| line.start_with?("#") }
    end

    def content_present?
      content.strip.present?
    end

    def no_fake_sources?
      content.exclude?("Không có nguồn cụ thể") && content.exclude?("[1]: Không có nguồn")
    end

    def table_data_rows
      table_body_rows.count
    end

    def table_rows_have_four_columns?
      table_body_rows.all? { |line| line.split("|").map(&:strip).reject(&:blank?).count == 4 }
    end

    def table_body_rows
      content.lines.map(&:strip).select do |line|
        line.start_with?("|") && !line.include?("---") && !line.include?(ESTIMATE_HEADER)
      end
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

    def content
      @artifact[:content].to_s
    end

    def summary(status, checks)
      failed = checks.reject { |item| item[:passed] }
      return "Bản nháp đã đạt các kiểm tra cơ bản và có thể dùng để tổng hợp câu trả lời cuối." if status == "verified"

      "Bản nháp cần sửa #{failed.count} điểm: #{failed.map { |item| item[:label] }.join(', ')}."
    end

    def markdown(status, checks)
      lines = [ "### Kiểm tra bản nháp", "- Trạng thái: `#{status}`" ]
      checks.each do |item|
        marker = item[:passed] ? "OK" : "Cần sửa"
        lines << "- #{marker}: #{item[:label]} — #{item[:message]}"
      end
      lines.join("\n")
    end
  end
end
