require "json"

module AgentLoop
  class ClarificationBuilder
    MIN_QUESTIONS = 1
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
      raise "Model không tạo được câu hỏi làm rõ hợp lệ" if questions.length < MIN_QUESTIONS

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
      raise "Model không tạo được câu hỏi làm rõ hợp lệ: #{e.message}"
    end

    private

    def messages
      [
        { role: "system", content: system_prompt },
        {
          role: "user",
          content: [
            PromptTemplate.render("clarification_user", message: @message),
            "Shared state của lượt chạy (dùng để không hỏi lại mục tiêu hoặc dữ kiện đã có):",
            JSON.pretty_generate(@context[:shared_state] || {})
          ].join("\n\n")
        }
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
        type = item["type"].to_s
        type = "single" if type == "choice" # Tương thích output model cũ.
        type = "single" unless %w[single multiple text].include?(type)
        options = Array(item["options"]).map { |option| option.to_s.squish }.reject(&:blank?).uniq.first(MAX_OPTIONS)
        next if question.blank? || (type != "text" && options.length < MIN_OPTIONS)

        {
          id: item["id"].presence || question_id(question, index),
          question: question,
          type: type,
          options: type == "text" ? [] : options
        }
      end.first(MAX_QUESTIONS)
    end

    def question_id(question, index)
      base = question.downcase.gsub(/[^a-z0-9\s_-]/, "").squish.tr(" ", "_")
      base.presence || "clarification_#{index + 1}"
    end

    def markdown_output(questions, source:)
      lines = [ "### Cần làm rõ thêm", "AI đề xuất #{questions.length} câu hỏi và các câu trả lời gợi ý:", "" ]
      questions.each do |question|
        lines << "- **#{question[:question]}**"
        question[:options].each { |option| lines << "  - #{option}" }
      end
      lines.join("\n")
    end
  end
end
