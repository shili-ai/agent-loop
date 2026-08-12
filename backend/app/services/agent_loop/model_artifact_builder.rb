require "csv"

module AgentLoop
  # Tạo artifact bằng model từ chứng cứ thật. Lớp này chỉ chuẩn hoá output và
  # xuất CSV khi model thực sự trả về bảng Markdown; không có template nội dung.
  class ModelArtifactBuilder
    def initialize(intent:, documents:, message:, context:, client: LocalModelClient.new, revision_notes: [])
      @intent = intent
      @documents = Array(documents)
      @message = message.to_s
      @context = context
      @client = client
      @revision_notes = revision_notes
    end

    attr_reader :client

    def call_with_metrics
      result = @client.chat_with_metrics(messages: messages, temperature: 0.1)
      content = result[:content].to_s.strip
      raise "Model không trả nội dung bản nháp" if content.blank?

      {
        tool: "model_artifact_writer",
        artifact: artifact(content),
        output: content,
        summary: "Model #{@client.model} đã soạn xong bản nháp dựa trên #{ @documents.count } nguồn thực.",
        metrics: result[:metrics],
        prompt_messages: messages,
        raw: result[:content]
      }
    end

    private

    def messages
      [
        {
          role: "system",
          content: <<~PROMPT
            Bạn là người soạn deliverable. Chỉ dùng chứng cứ trong brief; không được bịa số liệu, nguồn hay phạm vi.
            Nếu dữ kiện không đủ để tạo deliverable chính xác, hãy trả về đúng một dòng: NEEDS_CLARIFICATION: <nội dung còn thiếu>.
            Viết Markdown hoàn chỉnh, với tiêu đề #. Khi người dùng yêu cầu CSV/bảng estimate, bắt buộc trả Markdown table có header rõ ràng.
          PROMPT
        },
        { role: "user", content: JSON.pretty_generate(brief) }
      ]
    end

    def brief
      {
        request: @message,
        intent: @intent,
        evidence: @documents.map { |doc| doc.slice(:title, :snippet, :source, :url, :evaluation) },
        revision_notes: @revision_notes,
        conversation: @context[:recent_messages]
      }
    end

    def artifact(content)
      raise content.delete_prefix("NEEDS_CLARIFICATION:").strip.presence || "Model yêu cầu làm rõ" if content.start_with?("NEEDS_CLARIFICATION:")

      {
        title: content.lines.find { |line| line.start_with?("# ") }.to_s.delete_prefix("# ").strip.presence || "Bản nháp từ model",
        content: content,
        bullets: content.lines.grep(/\A[-*] /).map { |line| line.sub(/\A[-*] /, "").strip }.first(12),
        sources: @documents.map { |doc| doc[:title] }.compact,
        files: csv_file(content)
      }.compact
    end

    def csv_file(content)
      return [] unless csv_requested?

      lines = content.lines.map(&:strip)
      header_index = lines.each_index.find { |index| markdown_separator?(lines[index + 1]) }
      raise "Model không trả bảng Markdown để xuất CSV" unless header_index

      headers = cells(lines[header_index])
      rows = lines[(header_index + 2)..].to_a.take_while { |line| line.start_with?("|") }.map { |line| cells(line) }
      raise "Bảng từ model không có dữ liệu hợp lệ" if headers.length < 2 || rows.empty? || rows.any? { |row| row.length != headers.length }

      [ {
        title: "#{filename}.csv",
        name: "#{filename}.csv",
        mime: "text/csv;charset=utf-8",
        content: CSV.generate { |csv| csv << headers; rows.each { |row| csv << row } }
      } ]
    end

    def csv_requested?
      normalized = @message.downcase.unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").gsub("đ", "d")
      normalized.match?(/\b(csv|bang|table|est|estimate)\b/) || normalized.include?("ước lượng") || normalized.include?("uoc luong")
    end

    def markdown_separator?(line)
      line.to_s.match?(/\A\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\z/)
    end

    def cells(line)
      line.to_s.strip.delete_prefix("|").delete_suffix("|").split("|").map(&:strip)
    end

    def filename
      artifact_title = @message.unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").gsub("đ", "d")
      artifact_title.gsub(/[^a-zA-Z0-9]+/, "-").delete_prefix("-").delete_suffix("-").downcase.presence || "output"
    end
  end
end
