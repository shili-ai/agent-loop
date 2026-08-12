module AgentLoop
  class ResponseComposer
    def initialize(intent:, tool_result:, user_message:, model_answer: nil, clarification: nil)
      @intent = intent
      @tool_result = tool_result
      @user_message = user_message
      @model_answer = model_answer
      @clarification = clarification
    end

    def call
      return no_reliable_web_answer if no_reliable_web_evidence?
      artifact = visible_artifact
      return structured_artifact_answer(artifact) if structured_artifact?(artifact)
      return model_answer_with_web_sources if @model_answer.present?
      return clarification_answer if @clarification.present?

      return web_search_answer if web_results.present? && !artifact
      return document_search_answer unless artifact

      lines = []

      lines << headline
      lines << ""
      lines << artifact[:title]
      artifact[:bullets].each { |bullet| lines << "- #{bullet}" }
      lines << ""
      lines << "**Nguồn đã dùng:**"
      @tool_result[:documents].each do |document|
        lines << "- #{document[:title]} (#{document[:type]}): #{document[:snippet]}"
      end
      web_results.each do |result|
        lines << "- #{result[:title]}#{result[:url].present? ? " (#{result[:url]})" : ""}: #{result[:snippet]}"
      end
      lines << ""
      lines << missing_context_prompt if needs_more_context?

      lines.compact.join("\n")
    end

    private

    def no_reliable_web_evidence?
      @intent == "web_search" && web_results.blank? && web_search_attempted?
    end

    def structured_artifact?(artifact)
      content = artifact&.dig(:content).to_s
      return false if content.blank?

      table_requested? || markdown_table?(content)
    end

    def table_requested?
      normalized = @user_message.to_s.downcase
        .unicode_normalize(:nfkd)
        .gsub(/\p{Mn}/, "")
        .gsub("đ", "d")
      normalized.match?(/\b(table|bang|est|estimate)\b/) || normalized.match?(/ước lượng|uoc luong/) || normalized.include?("lap bang")
    end

    def markdown_table?(content)
      lines = content.lines.map(&:strip)
      lines.any? { |line| line.start_with?("|") } &&
        lines.any? { |line| line.match?(/\A\|?\s*:?-{3,}:?\s*\|/) || line.include?("|---") }
    end

    def structured_artifact_answer(artifact)
      lines = []
      lines << "Mình đã tạo output theo đúng định dạng yêu cầu:"
      lines << ""
      lines << artifact[:content].to_s.strip
      if artifact_files(artifact).any?
        lines << ""
        lines << "**Đầu ra:** #{artifact_files(artifact).map { |file| file[:name] || file['name'] }.compact.join(', ')}"
      end
      evidence_lines = evidence_section_lines
      if evidence_lines.any?
        lines << ""
        lines << "**Nguồn đã dùng:**"
        lines.concat(evidence_lines)
      end
      lines.join("\n")
    end

    def artifact_files(artifact)
      Array(artifact[:files] || artifact["files"])
    end

    def visible_artifact
      artifact = @tool_result[:artifact]
      return nil unless artifact
      return artifact if artifact[:downloadable] == true || artifact["downloadable"] == true
      return artifact if artifact_files(artifact).any?

      nil
    end

    def web_search_attempted?
      Array(@tool_result[:working_notes]).any? do |note|
        (note[:action] || note["action"]).to_s == "web_search"
      end
    end

    def no_reliable_web_answer
      candidate_text =
        if web_candidate_titles.any?
          " Mình có thấy một số ứng viên như #{web_candidate_titles.first(5).join(', ')}, nhưng chúng chưa đủ khớp hoặc chưa đủ đáng tin để dùng làm bằng chứng."
        else
          ""
        end

      "Mình chưa tìm thấy nguồn web chính thống/đáng tin phù hợp cho yêu cầu này sau khi lọc kết quả kém chất lượng, nên mình không kết luận hoặc gắn nguồn thay thế.#{candidate_text} Bạn có thể gửi thêm tên công ty, quốc gia, ảnh chụp, hoặc nguồn gốc bạn thấy `#{@user_message}` để mình tìm hẹp hơn."
    end

    def web_candidate_titles
      @web_candidate_titles ||= Array(@tool_result[:working_notes]).flat_map do |note|
        next [] unless (note[:action] || note["action"]).to_s == "web_search"

        note[:candidate_titles] || note["candidate_titles"] || []
      end.compact.uniq
    end

    def model_answer_with_web_sources
      answer = sanitize_unverified_links(@model_answer.to_s.strip)
      return answer if web_results.blank?
      return answer if answer.include?("**Nguồn web đã dùng:**")

      [
        answer,
        "",
        web_sources_section
      ].join("\n")
    end

    def sanitize_unverified_links(answer)
      sanitized = answer.gsub(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/i) do
        label = Regexp.last_match(1)
        url = Regexp.last_match(2)
        verified_url?(url) ? "[#{label}](#{url})" : label
      end

      sanitized.gsub(/https?:\/\/[^\s\)\]\}>,]+/i) do |url|
        verified_url?(url) ? url : ""
      end
    end

    def verified_url?(url)
      normalized_url = normalize_url(url)
      verified_urls.any? { |verified| normalized_url == verified || normalized_url.start_with?("#{verified}/") }
    end

    def verified_urls
      @verified_urls ||= web_results.filter_map { |result| normalize_url(result[:url]) if result[:url].present? }
    end

    def normalize_url(url)
      url.to_s.strip.sub(/[.,;:!?]+\z/, "").delete_suffix("/").downcase
    end

    def clarification_answer
      "Mình cần làm rõ vài thông tin trước khi tiếp tục. Bạn chọn câu trả lời trong form bên dưới nhé."
    end

    def document_search_answer
      lines = [ "Mình đã tìm được các tài liệu liên quan:", "" ]
      @tool_result[:documents].each do |document|
        lines << "- **#{document[:title]}** (`#{document[:type]}`): #{document[:snippet]}"
      end
      lines << ""
      lines << missing_context_prompt if needs_more_context?
      lines.compact.join("\n")
    end

    def web_search_answer
      lines = [ "Mình đã tìm được các kết quả web liên quan:", "" ]
      lines.concat(web_source_lines)
      lines << ""
      lines << missing_context_prompt if needs_more_context?
      lines.compact.join("\n")
    end

    def web_sources_section
      [ "**Nguồn web đã dùng:**", *web_source_lines ].join("\n")
    end

    def evidence_section_lines
      lines = []
      @tool_result[:documents].to_a.each do |document|
        lines << "- **#{document[:title]}**#{document[:source].present? ? " (#{document[:source]})" : ""}"
      end
      lines.concat(web_source_lines) if web_results.present?
      lines
    end

    def web_source_lines
      web_results.map do |result|
        url = result[:url].present? ? " ([nguồn](#{result[:url]}))" : ""
        page = web_page_for(result[:url])
        summary = page&.dig(:description).presence || page&.dig(:content).to_s.first(240).presence || result[:snippet]
        "- **#{result[:title]}**#{url}: #{summary}"
      end
    end

    def web_page_for(url)
      normalized_url = normalize_url(url)
      web_pages.find { |page| normalize_url(page[:url]) == normalized_url }
    end

    def headline
      case @intent
      when "proposal" then "Mình sẽ phác thảo proposal dựa trên tài liệu gần nhất."
      when "battlecard" then "Đây là battlecard nhanh cho tình huống presales."
      when "follow_up" then "Đây là khung follow-up có thể gửi sau buổi discovery."
      when "rfp_answer" then "Đây là cách draft câu trả lời RFP/RFI có dẫn nguồn."
      else "Mình đã tìm tài liệu liên quan và tóm tắt hướng xử lý."
      end
    end

    def needs_more_context?
      return false if @user_message.downcase.include?("bổ sung ngữ cảnh:")

      @user_message.split.length < 8
    end

    def missing_context_prompt
      "Cần thêm ngữ cảnh để chính xác hơn: tên sản phẩm, loại khách hàng và output bạn muốn là email, proposal hay battlecard?"
    end

    def web_results
      @tool_result[:web_results] || []
    end

    def web_pages
      @tool_result[:web_pages] || []
    end
  end
end
