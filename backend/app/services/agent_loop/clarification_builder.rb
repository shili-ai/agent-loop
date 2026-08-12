require "json"

module AgentLoop
  class ClarificationBuilder
    MIN_QUESTIONS = 3
    MAX_QUESTIONS = 5
    MIN_OPTIONS = 2
    MAX_OPTIONS = 4

    def initialize(message:, context: {}, client: LocalModelClient.new)
      @message = message.to_s
      @context = context
      @client = client
    end

    def prompt_messages
      messages
    end

    def prompt_layer_summary
      prompt_composer.prompt_layer_summary
    end

    def call
      prompt = prompt_messages
      result = @client.chat_with_metrics(messages: prompt, temperature: 0.2, format: "json")
      questions = sanitize_questions(parse(result[:content]))
      raise "Model không tạo đủ câu hỏi làm rõ" if questions.length < MIN_QUESTIONS

      {
        questions: questions,
        output: markdown_output(questions, source: "model"),
        source: "model",
        provider: @client.provider,
        model: @client.model,
        prompt_messages: prompt,
        prompt_layers: prompt_layer_summary,
        metrics: result[:metrics],
        raw: result[:content]
      }
    rescue StandardError => e
      questions = fallback_questions
      {
        questions: questions,
        output: markdown_output(questions, source: "fallback"),
        source: "fallback",
        provider: @client.provider,
        model: @client.model,
        prompt_messages: prompt_messages,
        prompt_layers: prompt_layer_summary,
        error: e.message
      }
    end

    private

    def messages
      [
        { role: "system", content: system_prompt },
        { role: "user", content: PromptTemplate.render("clarification_user", message: @message) }
      ]
    end

    def system_prompt
      prompt_composer.system_prompt
    end

    def prompt_composer
      @prompt_composer ||= PromptComposer.new(
        base_system: PromptTemplate.render("clarification_system"),
        context: @context,
        purpose: :clarification
      )
    end

    def parse(content)
      data = JSON.parse(extract_json(content))
      questions = data.is_a?(Hash) ? data["questions"] : data
      raise "Model không trả về mảng questions" unless questions.is_a?(Array)

      questions
    end

    def extract_json(content)
      text = content.to_s.strip
      return text if text.start_with?("{") || text.start_with?("[")

      starts = [ text.index("{"), text.index("[") ].compact
      finish = [ text.rindex("}"), text.rindex("]") ].compact.max
      start = starts.min
      raise "Model không trả JSON hợp lệ" unless start && finish && finish > start

      text[start..finish]
    end

    def sanitize_questions(items)
      items.filter_map.with_index do |item, index|
        next unless item.is_a?(Hash)

        question = item["question"].to_s.squish
        options = Array(item["options"]).map { |option| option.to_s.squish }.reject(&:blank?).uniq.first(MAX_OPTIONS)
        next if question.blank? || options.length < MIN_OPTIONS

        {
          id: item["id"].presence || question_id(question, index),
          question: question,
          type: "choice",
          options: options
        }
      end.first(MAX_QUESTIONS)
    end

    def question_id(question, index)
      base = question.downcase.gsub(/[^a-z0-9\s_-]/, "").squish.tr(" ", "_")
      base.presence || "clarification_#{index + 1}"
    end

    def markdown_output(questions, source:)
      label = source == "model" ? "AI đề xuất" : "Fallback theo nội dung yêu cầu"
      lines = [ "### Cần làm rõ thêm", "#{label} #{questions.length} câu hỏi và các câu trả lời gợi ý:", "" ]
      questions.each do |question|
        lines << "- **#{question[:question]}**"
        question[:options].each { |option| lines << "  - #{option}" }
      end
      lines.join("\n")
    end

    def fallback_questions
      return estimate_questions if clarification_policy.category == "estimate"
      return risky_change_questions if clarification_policy.category == "risky_change"
      return ambiguous_change_questions if clarification_policy.category == "ambiguous_change"

      output_options = inferred_output_options
      [
        {
          id: "desired_output",
          question: "Bạn muốn agent ưu tiên dạng đầu ra nào cho yêu cầu này?",
          type: "choice",
          options: output_options
        },
        {
          id: "audience_context",
          question: "Ngữ cảnh người nhận hoặc khách hàng nên được hiểu theo hướng nào?",
          type: "choice",
          options: [ "SMB cần giải pháp nhanh", "Enterprise quan tâm bảo mật và tích hợp", "Đội mua hàng cần ROI rõ", "Chưa xác định, agent tự giả định hợp lý" ]
        },
        {
          id: "depth",
          question: "Mức độ chi tiết bạn muốn agent dùng là gì?",
          type: "choice",
          options: [ "Ngắn gọn để gửi ngay", "Có luận điểm và bằng chứng", "Chi tiết theo từng bước", "Chỉ cần khung nháp để chỉnh tiếp" ]
        },
        {
          id: "tone",
          question: "Giọng văn nên theo hướng nào?",
          type: "choice",
          options: [ "Chuyên nghiệp, trực tiếp", "Tư vấn mềm và thân thiện", "Thuyết phục theo số liệu", "Trung lập để dễ tuỳ chỉnh" ]
        }
      ]
    end

    def estimate_questions
      [
        {
          id: "estimate_scope",
          question: "Bạn muốn estimate những hạng mục/chức năng nào?",
          type: "choice",
          options: [ "Chỉ tích hợp cổng thanh toán", "Cổng thanh toán và webhook", "Bao gồm UI, backend và kiểm thử", "Gửi scope chi tiết riêng" ]
        },
        {
          id: "estimate_format",
          question: "Bạn muốn nhận estimate theo định dạng nào?",
          type: "choice",
          options: [ "Bảng Markdown", "File CSV", "Cả Markdown và CSV", "Proposal có bảng estimate" ]
        },
        {
          id: "estimate_unit",
          question: "Đơn vị ước lượng bạn cần là gì?",
          type: "choice",
          options: [ "Man-day", "Giờ công", "Chi phí USD", "Giờ công và chi phí USD" ]
        }
      ]
    end

    def risky_change_questions
      [
        {
          id: "change_scope",
          question: "Bạn muốn áp dụng thay đổi ở mức nào?",
          type: "choice",
          options: [ "Chỉ UI/wording", "Backend behavior nhưng giữ fallback", "Xoá/đổi hẳn code liên quan", "Cả frontend, backend và docs" ]
        },
        {
          id: "data_policy",
          question: "Dữ liệu hoặc cấu hình local hiện có nên xử lý thế nào?",
          type: "choice",
          options: [ "Giữ nguyên dữ liệu local", "Chỉ dọn config không còn dùng", "Xoá cả dữ liệu phát sinh", "Hỏi riêng trước khi xoá dữ liệu" ]
        },
        {
          id: "compatibility",
          question: "Có cần giữ tương thích ngược trong một thời gian không?",
          type: "choice",
          options: [ "Có, giữ fallback/migration", "Không, đổi thẳng sang cách mới", "Chỉ giữ API cũ tạm thời", "Chưa chắc, đề xuất phương án an toàn" ]
        }
      ]
    end

    def ambiguous_change_questions
      [
        {
          id: "target_scope",
          question: "Bạn muốn mình tác động vào phần nào trước?",
          type: "choice",
          options: [ "Frontend/UI", "Backend/agent loop", "Prompt/skill", "Cả luồng end-to-end" ]
        },
        {
          id: "success_criteria",
          question: "Tiêu chí hoàn thành chính là gì?",
          type: "choice",
          options: [ "Đúng hành vi trước", "UI nhìn hợp lý hơn", "Câu trả lời chất lượng hơn", "Giảm lỗi và dễ debug hơn" ]
        },
        {
          id: "change_depth",
          question: "Mức độ thay đổi bạn muốn là gì?",
          type: "choice",
          options: [ "Nhỏ, ít rủi ro", "Vừa phải, có refactor nhẹ", "Mạnh tay nếu kiến trúc tốt hơn", "Hỏi lại trước mỗi thay đổi lớn" ]
        }
      ]
    end

    def inferred_output_options
      text = @message.downcase
      options = []
      options << "Email follow-up gửi khách" if text.include?("email") || text.include?("follow")
      options << "Proposal ngắn có bullet" if text.include?("proposal") || text.include?("đề xuất")
      options << "Battlecard so sánh đối thủ" if text.include?("battlecard") || text.include?("đối thủ")
      options << "Câu trả lời RFP/RFI" if text.include?("rfp") || text.include?("rfi")
      (options + [ "Tóm tắt tư vấn presales", "Checklist hành động tiếp theo", "Bản nháp có thể chỉnh sửa" ]).uniq.first(MAX_OPTIONS)
    end

    def clarification_policy
      @clarification_policy ||= ClarificationPolicy.new(message: @message, context: @context)
    end
  end
end
