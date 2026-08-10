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
      return model_answer_with_web_sources if @model_answer.present?
      return clarification_answer if @clarification.present?

      artifact = @tool_result[:artifact]
      return web_search_answer if web_results.present? && !artifact
      return document_search_answer unless artifact

      lines = []

      lines << headline
      lines << ""
      lines << artifact[:title]
      artifact[:bullets].each { |bullet| lines << "- #{bullet}" }
      lines << ""
      lines << "**Nguồn demo:**"
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
      lines = [ "Mình cần thêm một chút ngữ cảnh để trả lời chính xác hơn:", "" ]
      @clarification[:questions].each do |question|
        text = question.is_a?(Hash) ? question[:question] : question
        lines << "- #{text}"
      end
      lines.join("\n")
    end

    def document_search_answer
      lines = [ "Mình đã tìm được các tài liệu demo liên quan:", "" ]
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

    def web_source_lines
      web_results.map do |result|
        url = result[:url].present? ? " ([nguồn](#{result[:url]}))" : ""
        "- **#{result[:title]}**#{url}: #{result[:snippet]}"
      end
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
  end
end
