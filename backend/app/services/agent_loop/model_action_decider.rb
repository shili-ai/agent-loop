require "json"

module AgentLoop
  # Ở mỗi vòng lặp, hỏi model local (Ollama) chọn action tiếp theo từ danh sách
  # tool. Model tự quyết định khi nào dừng (final_answer) nên số bước thay đổi
  # theo từng câu hỏi. Nếu model lỗi/không phản hồi, rơi về luật dự phòng.
  class ModelActionDecider
    ACTIONS = {
      "search_documents" => "Tìm tài liệu / dẫn chứng nội bộ liên quan tới yêu cầu.",
      "web_search" => "Tìm thông tin mới hoặc thông tin ngoài kho nội bộ trên web.",
      "draft_artifact" => "Soạn bản nháp (proposal, battlecard, email, RFP...) dựa trên tài liệu đã có.",
      "ask_clarification" => "Hỏi lại người dùng khi yêu cầu quá ngắn hoặc thiếu ngữ cảnh.",
      "final_answer" => "Dừng vòng lặp và tổng hợp câu trả lời cuối cho người dùng."
    }.freeze

    # Sau ngần này lần tìm tài liệu mà vẫn rỗng thì không cho tìm lại nữa.
    MAX_SEARCH_ATTEMPTS = 2

    def initialize(intent:, message:, state:, iteration:, max_iterations:, plan:, context: {}, client: LocalModelClient.new)
      @intent = intent
      @message = message
      @state = state
      @iteration = iteration
      @max_iterations = max_iterations
      @plan = plan
      @context = context
      @client = client
    end

    def prompt_messages
      messages
    end

    def call
      return forced_final if @iteration >= @max_iterations

      guard_answered_clarification(
        guard_completed_artifact(
          guard_repeated_web_search(
            guard_repeated_search(
              guard_stop_after_empty_web_search(
                guard_prefer_web_search(decide)
              )
            )
          )
        )
      )
    end

    private

    def decide
      @last_prompt_messages = prompt_messages
      result = @client.chat_with_metrics(messages: @last_prompt_messages, temperature: 0, format: "json")
      parsed = parse(result[:content])
      build(parsed[:action], parsed[:reason], source: "model", metrics: result[:metrics], raw: result[:content])
    rescue StandardError => e
      fallback(e)
    end

    # Chặn vòng lặp tìm tài liệu vô ích: nếu đã tìm đủ số lần mà vẫn không có
    # tài liệu, ép chuyển sang bước tiếp theo thay vì tìm lại.
    def guard_repeated_search(decision)
      return decision unless decision[:action] == "search_documents"
      return decision if documents.any?
      return decision if search_attempts < MAX_SEARCH_ATTEMPTS

      alternative =
        if @intent == "document_search" || artifact?
          "final_answer"
        else
          "draft_artifact"
        end
      build(
        alternative,
        "Đã tìm tài liệu #{search_attempts} lần nhưng không có kết quả; chuyển sang #{alternative} thay vì tìm lại.",
        source: "guard"
      )
    end

    def guard_prefer_web_search(decision)
      return decision unless decision[:action] == "search_documents"
      return decision unless @intent == "web_search"
      return decision if web_attempts.positive?

      build(
        "web_search",
        "Yêu cầu cần thông tin ngoài web; dùng web_search thay vì search_documents nội bộ.",
        source: "guard"
      )
    end

    def guard_stop_after_empty_web_search(decision)
      return decision unless @intent == "web_search"
      return decision unless web_attempts.positive? && web_results.empty?
      return decision if decision[:action] == "final_answer"

      build(
        "final_answer",
        "Đã thử tìm web nhưng không có nguồn đáng tin phù hợp; không chuyển sang tài liệu nội bộ/dummy cho yêu cầu web.",
        source: "guard"
      )
    end

    def guard_completed_artifact(decision)
      return decision unless decision[:action] == "draft_artifact"
      return decision unless artifact?

      build(
        "final_answer",
        "Bản nháp đã được tạo ở vòng trước; dừng lặp draft_artifact và chuyển sang tổng hợp câu trả lời cuối.",
        source: "guard"
      )
    end

    def guard_repeated_web_search(decision)
      return decision unless decision[:action] == "web_search"
      return decision if web_results.empty? && web_attempts.zero?

      alternative = artifact? || @intent == "document_search" ? "final_answer" : "draft_artifact"
      build(
        alternative,
        "Web search đã chạy trong vòng trước; không lặp lại và chuyển sang #{alternative}.",
        source: "guard"
      )
    end

    def forced_final
      build("final_answer", "Đã chạm giới hạn #{@max_iterations} vòng, dừng để tổng hợp.", source: "guard")
    end

    def guard_answered_clarification(decision)
      return decision unless decision[:action] == "ask_clarification"
      return decision unless answered_clarification?

      alternative =
        if documents.empty?
          "search_documents"
        elsif @intent == "document_search" || artifact?
          "final_answer"
        else
          "draft_artifact"
        end
      build(
        alternative,
        "Người dùng đã trả lời câu hỏi làm rõ; tiếp tục với #{alternative} thay vì hỏi lại.",
        source: "guard"
      )
    end

    def fallback(error)
      rule = ActionDecider.new(
        intent: @intent,
        message: @message,
        state: @state,
        iteration: @iteration,
        max_iterations: @max_iterations,
        context: @context
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
        prompt_messages: @last_prompt_messages,
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
        search_attempts: search_attempts,
        web_results_count: web_results.count,
        web_attempts: web_attempts,
        has_artifact: artifact? ? "có" : "chưa",
        clarified: clarified? || answered_clarification? ? "rồi" : "chưa",
        working_notes: working_notes_prompt,
        recent_messages: recent_messages_prompt
      )
    end

    def markdown(action, reason, source)
      label = { "model" => "model chọn", "fallback" => "luật dự phòng", "guard" => "giới hạn an toàn" }.fetch(source, source)
      "### Quyết định vòng #{@iteration} (#{label})\n- Action: `#{action}`\n- Lý do: #{reason}"
    end

    def documents
      @state[:documents] || []
    end

    def search_attempts
      @state[:search_attempts].to_i
    end

    def artifact?
      @state[:artifact].present?
    end

    def web_results
      @state[:web_results] || []
    end

    def web_attempts
      @state[:web_attempts].to_i
    end

    def working_notes_prompt
      notes = Array(@state[:working_notes]).last(8)
      return "Chưa có." if notes.empty?

      notes.map do |note|
        action = note[:action] || note["action"]
        summary = note[:summary] || note["summary"]
        "- #{action}: #{summary}"
      end.join("\n")
    end

    def clarified?
      @state[:clarification].present?
    end

    def answered_clarification?
      @message.downcase.include?("bổ sung ngữ cảnh:")
    end

    def recent_messages_prompt
      recent_messages = Array(@context[:recent_messages]).last(6)
      lines = []
      if @context[:project]
        project = @context[:project]
        lines << "- project: #{project[:title]} | #{project[:shared_context].to_s.truncate(500)}"
      end
      return "Không có." if recent_messages.empty? && lines.empty?

      message_lines = recent_messages.map do |message|
        role = message[:role] || message["role"]
        content = message[:content] || message["content"]
        "- #{role}: #{content.to_s.truncate(500)}"
      end
      (lines + message_lines).join("\n")
    end
  end
end
