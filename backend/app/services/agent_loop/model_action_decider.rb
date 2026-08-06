require "json"

module AgentLoop
  # Ở mỗi vòng lặp, hỏi model local (Ollama) chọn action tiếp theo từ danh sách
  # tool. Model tự quyết định khi nào dừng (final_answer) nên số bước thay đổi
  # theo từng câu hỏi. Nếu model lỗi/không phản hồi, rơi về luật dự phòng.
  class ModelActionDecider
    ACTIONS = {
      "search_documents" => "Tìm tài liệu / dẫn chứng nội bộ liên quan tới yêu cầu.",
      "draft_artifact" => "Soạn bản nháp (proposal, battlecard, email, RFP...) dựa trên tài liệu đã có.",
      "ask_clarification" => "Hỏi lại người dùng khi yêu cầu quá ngắn hoặc thiếu ngữ cảnh.",
      "final_answer" => "Dừng vòng lặp và tổng hợp câu trả lời cuối cho người dùng."
    }.freeze

    def initialize(intent:, message:, state:, iteration:, max_iterations:, plan:, client: LocalModelClient.new)
      @intent = intent
      @message = message
      @state = state
      @iteration = iteration
      @max_iterations = max_iterations
      @plan = plan
      @client = client
    end

    def call
      return forced_final if @iteration >= @max_iterations

      result = @client.chat_with_metrics(messages: messages, temperature: 0, format: "json")
      parsed = parse(result[:content])
      build(parsed[:action], parsed[:reason], source: "model", metrics: result[:metrics], raw: result[:content])
    rescue StandardError => e
      fallback(e)
    end

    private

    def forced_final
      build("final_answer", "Đã chạm giới hạn #{@max_iterations} vòng, dừng để tổng hợp.", source: "guard")
    end

    def fallback(error)
      rule = ActionDecider.new(
        intent: @intent,
        message: @message,
        state: @state,
        iteration: @iteration,
        max_iterations: @max_iterations
      ).call
      build(
        rule[:action],
        "Model không phản hồi được (#{error.message}); dùng luật dự phòng: #{rule[:reason]}",
        source: "fallback"
      )
    end

    def build(action, reason, source:, metrics: nil, raw: nil)
      normalized = ACTIONS.key?(action) ? action : "final_answer"
      {
        action: normalized,
        reason: reason.to_s.strip.presence || ACTIONS[normalized],
        source: source,
        provider: "ollama",
        model: @client.model,
        metrics: metrics,
        raw: raw,
        output: markdown(normalized, reason, source)
      }
    end

    def parse(content)
      data = JSON.parse(extract_json(content))
      { action: data["action"].to_s.strip, reason: data["reason"].to_s.strip }
    end

    def extract_json(content)
      text = content.to_s.strip
      return text if text.start_with?("{")

      start = text.index("{")
      finish = text.rindex("}")
      raise "Model không trả JSON hợp lệ" unless start && finish && finish > start

      text[start..finish]
    end

    def messages
      [
        { role: "system", content: system_prompt },
        { role: "user", content: user_prompt }
      ]
    end

    def system_prompt
      PromptTemplate.render(
        "decider_system",
        action_catalog: action_catalog,
        action_keys: ACTIONS.keys.join(", ")
      )
    end

    def action_catalog
      ACTIONS.map { |name, description| "- #{name}: #{description}" }.join("\n")
    end

    def user_prompt
      PromptTemplate.render(
        "decider_user",
        message: @message,
        intent: @intent,
        goal: @plan&.dig(:goal),
        iteration: @iteration,
        max_iterations: @max_iterations,
        documents_count: documents.count,
        has_artifact: artifact? ? "có" : "chưa",
        clarified: clarified? ? "rồi" : "chưa"
      )
    end

    def markdown(action, reason, source)
      label = { "model" => "model chọn", "fallback" => "luật dự phòng", "guard" => "giới hạn an toàn" }.fetch(source, source)
      "### Quyết định vòng #{@iteration} (#{label})\n- Action: `#{action}`\n- Lý do: #{reason}"
    end

    def documents
      @state[:documents] || []
    end

    def artifact?
      @state[:artifact].present?
    end

    def clarified?
      @state[:clarification].present?
    end
  end
end
