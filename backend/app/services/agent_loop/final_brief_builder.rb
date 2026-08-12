module AgentLoop
  class FinalBriefBuilder
    def initialize(user_message:, intent:, context:, tool_result:)
      @user_message = user_message
      @intent = intent
      @context = context
      @tool_result = tool_result
    end

    def call
      {
        request: @user_message,
        intent: @intent,
        customer: conversation[:customer_name],
        industry: conversation[:industry],
        project: project,
        working_notes: working_notes,
        evidence: evidence,
        web_evidence: web_evidence,
        web_pages: web_pages,
        draft: draft,
        artifacts: artifacts,
        output_contract: output_contract,
        missing_context: missing_context
      }
    end

    private

    def evidence
      @tool_result[:documents].map do |document|
        {
          title: document[:title],
          type: document[:type],
          snippet: document[:snippet],
          source: document[:source],
          url: document[:url],
          evaluation: document[:evaluation]
        }.compact
      end
    end

    def working_notes
      Array(@tool_result[:working_notes]).map do |note|
        {
          action: note[:action] || note["action"],
          summary: note[:summary] || note["summary"],
          evidence_count: note[:evidence_count] || note["evidence_count"],
          raw_count: note[:raw_count] || note["raw_count"],
          titles: note[:titles] || note["titles"],
          candidate_titles: note[:candidate_titles] || note["candidate_titles"]
        }.compact
      end
    end

    def web_evidence
      Array(@tool_result[:web_results]).map do |result|
        {
          title: result[:title],
          url: result[:url],
          snippet: result[:snippet],
          source: result[:source],
          evaluation: result[:evaluation]
        }.compact
      end
    end

    def web_pages
      Array(@tool_result[:web_pages]).map do |page|
        {
          title: page[:title],
          url: page[:url],
          description: page[:description],
          headings: page[:headings],
          content: page[:content],
          content_length: page[:content_length],
          evaluation: page[:evaluation]
        }.compact
      end
    end

    def conversation
      @context[:conversation] || {}
    end

    def project
      @context[:project]
    end

    def draft
      artifact = @tool_result[:artifact]
      return nil unless visible_artifact?(artifact)

      {
        title: artifact[:title],
        bullets: artifact[:bullets],
        content: artifact[:content],
        sections: artifact[:sections],
        sources: artifact[:sources],
        files: Array(artifact[:files]).map { |file| file.slice(:title, :name, :mime) }
      }.compact
    end

    def artifacts
      Array(@tool_result[:artifacts]).map do |entry|
        {
          id: entry[:id] || entry["id"],
          title: entry[:title] || entry["title"],
          status: entry[:status] || entry["status"],
          checks: entry[:checks] || entry["checks"]
        }.compact
      end
    end

    def output_contract
      artifact = @tool_result[:artifact]
      return {} unless visible_artifact?(artifact)

      content = artifact&.dig(:content).to_s
      {
        preserve_draft_content: content.present?,
        markdown_table_required: table_request? || content.include?("| Item | Feature | Effort (Man-day) | Remarks |"),
        required_columns: table_request? ? [ "Item", "Feature", "Effort (Man-day)", "Remarks" ] : nil
      }.compact
    end

    def visible_artifact?(artifact)
      return false unless artifact

      artifact[:downloadable] == true || artifact["downloadable"] == true || Array(artifact[:files] || artifact["files"]).any?
    end

    def table_request?
      normalized = @user_message.to_s.downcase
        .unicode_normalize(:nfkd)
        .gsub(/\p{Mn}/, "")
        .gsub("đ", "d")
      normalized.match?(/\b(table|bang)\b/) || normalized.include?("lap bang")
    end

    def missing_context
      return [] if clarified?
      return [] if @user_message.split.length >= 8

      [ "tên sản phẩm", "loại khách hàng", "output mong muốn" ]
    end

    def clarified?
      @user_message.downcase.include?("bổ sung ngữ cảnh:") ||
        Array(@context[:recent_messages]).any? do |message|
          role = message[:role] || message["role"]
          content = message[:content] || message["content"]
          role == "user" && content.to_s.downcase.start_with?("bổ sung ngữ cảnh:")
        end
    end
  end
end
