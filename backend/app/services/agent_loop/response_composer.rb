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
      return @model_answer if @model_answer.present?
      return clarification_answer if @clarification.present?

      artifact = @tool_result[:artifact]
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
      lines << ""
      lines << missing_context_prompt if needs_more_context?

      lines.compact.join("\n")
    end

    private

    def clarification_answer
      lines = ["Mình cần thêm một chút ngữ cảnh để trả lời chính xác hơn:", ""]
      @clarification[:questions].each { |question| lines << "- #{question}" }
      lines.join("\n")
    end

    def document_search_answer
      lines = ["Mình đã tìm được các tài liệu demo liên quan:", ""]
      @tool_result[:documents].each do |document|
        lines << "- **#{document[:title]}** (`#{document[:type]}`): #{document[:snippet]}"
      end
      lines << ""
      lines << missing_context_prompt if needs_more_context?
      lines.compact.join("\n")
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
      @user_message.split.length < 8
    end

    def missing_context_prompt
      "Cần thêm ngữ cảnh để chính xác hơn: tên sản phẩm, loại khách hàng và output bạn muốn là email, proposal hay battlecard?"
    end
  end
end
