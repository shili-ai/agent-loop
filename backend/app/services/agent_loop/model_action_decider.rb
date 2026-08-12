require "json"

module AgentLoop
  # Plan đã được tạo ở bước phân tích là flow chính của lượt chạy. Mỗi vòng chỉ
  # lấy bước chưa hoàn thành tiếp theo trong plan; model chỉ là fallback cho plan
  # cũ/không hợp lệ. Các guard bên dưới vẫn có quyền can thiệp khi trạng thái
  # thực tế yêu cầu làm rõ, kiểm tra hoặc sửa artifact.
  class ModelActionDecider
    ACTIONS = {
      "search_documents" => "Tìm tài liệu / dẫn chứng nội bộ liên quan tới yêu cầu.",
      "web_search" => "Tìm thông tin mới hoặc thông tin ngoài kho nội bộ trên web.",
      "draft_artifact" => "Soạn bản nháp (proposal, battlecard, email, RFP...) dựa trên tài liệu đã có.",
      "verify_artifact" => "Kiểm tra bản nháp vừa tạo: đúng yêu cầu, đủ cấu trúc, đủ nguồn và không bịa dữ liệu.",
      "revise_artifact" => "Sửa bản nháp khi bước kiểm tra phát hiện thiếu cấu trúc, thiếu nội dung hoặc chưa đúng yêu cầu.",
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

    def prompt_layer_summary
      prompt_composer.prompt_layer_summary
    end

    def call
      return forced_final if @iteration >= @max_iterations

      planned = planned_decision || decide
      guard_answered_clarification(
        guard_clarification_required(
          guard_direct_final_plan(
            guard_verified_artifact(
              guard_artifact_needs_verification(
                guard_artifact_needs_revision(
                  guard_completed_artifact(
                    guard_repeated_web_search(
                      guard_repeated_search(
                        guard_stop_after_empty_web_search(
                          guard_prefer_web_search(planned)
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    end

    private

    def planned_decision
      action = next_planned_action
      return unless action

      build(
        action,
        "Thực hiện bước tiếp theo trong plan: #{planned_step_title(action)}.",
        source: "plan"
      )
    end

    def next_planned_action
      planned_steps.find { |step| !plan_step_completed?(step[:action]) }&.fetch(:action)
    end

    def planned_steps
      Array(@plan&.dig(:steps)).filter_map do |step|
        action = (step[:action] || step["action"]).to_s
        next unless ACTIONS.key?(action)

        { action: action, title: (step[:title] || step["title"]).to_s }
      end
    end

    def plan_step_completed?(action)
      case action
      when "search_documents" then search_attempts.positive?
      when "web_search" then web_attempts.positive?
      when "draft_artifact" then artifact?
      when "verify_artifact" then latest_artifact_status.present?
      when "revise_artifact"
        Array(@state[:working_notes]).any? { |note| (note[:action] || note["action"]).to_s == "revise_artifact" }
      when "ask_clarification" then clarified? || answered_clarification?
      when "final_answer" then false
      else false
      end
    end

    def planned_step_title(action)
      planned_steps.find { |step| step[:action] == action }&.dig(:title).presence || ACTIONS[action]
    end

    def guard_direct_final_plan(decision)
      return decision if decision[:action] == "final_answer"
      return decision unless direct_final_plan?
      return decision if artifact? && latest_artifact_status != "verified"

      build(
        "final_answer",
        "Plan chỉ cần trả lời trực tiếp, nên mình không tạo bản nháp hay tìm nguồn thêm.",
        source: "guard"
      )
    end

    def decide
      @last_prompt_messages = prompt_messages
      result = @client.chat_with_metrics(messages: @last_prompt_messages, temperature: 0, format: "json")
      parsed = parse(result[:content])
      build(parsed[:action], parsed[:reason], source: "model", metrics: result[:metrics], raw: result[:content])
    rescue StandardError => e
      raise "Model không chọn được action tiếp theo: #{e.message}"
    end

    # Chặn vòng lặp tìm tài liệu vô ích: nếu đã tìm đủ số lần mà vẫn không có
    # tài liệu, ép chuyển sang bước tiếp theo thay vì tìm lại.
    def guard_repeated_search(decision)
      return decision unless decision[:action] == "search_documents"
      if documents.any? && search_attempts.positive?
        alternative = @intent == "document_search" || artifact? ? "final_answer" : "draft_artifact"
        return build(
          alternative,
          "Đã có tài liệu từ bước tìm nguồn trước đó; không tìm lại và chuyển sang #{alternative}.",
          source: "guard"
        )
      end
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
        "verify_artifact",
        "Bản nháp đã được tạo ở vòng trước; mình chuyển sang kiểm tra bản nháp trước khi trả lời cuối.",
        source: "guard"
      )
    end

    def guard_clarification_required(decision)
      return decision if decision[:action] == "ask_clarification"
      return decision unless clarification_policy.required?

      build(
        "ask_clarification",
        clarification_policy.reason,
        source: "guard"
      )
    end

    def guard_artifact_needs_revision(decision)
      return decision unless latest_artifact_status == "needs_revision"
      return decision if decision[:action] == "revise_artifact"

      build(
        "revise_artifact",
        "Bước kiểm tra cho thấy bản nháp còn thiếu hoặc chưa đúng, nên mình sửa trước khi tổng hợp.",
        source: "guard"
      )
    end

    def guard_artifact_needs_verification(decision)
      return decision unless artifact?
      return decision if %w[verify_artifact revise_artifact].include?(decision[:action])
      return decision if latest_artifact_status == "verified"
      return decision if latest_artifact_status == "needs_revision"

      build(
        "verify_artifact",
        "Đã có bản nháp nhưng chưa được kiểm tra, nên mình verify trước khi trả lời cuối.",
        source: "guard"
      )
    end

    def guard_verified_artifact(decision)
      return decision unless artifact?
      return decision unless latest_artifact_status == "verified"
      return decision if decision[:action] == "final_answer"

      build(
        "final_answer",
        "Bản nháp đã qua kiểm tra, mình chuyển sang tổng hợp câu trả lời cuối.",
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

    def direct_final_plan?
      actions = Array(@plan&.dig(:actions)).map(&:to_s).reject(&:blank?)
      return true if actions == [ "final_answer" ]

      steps = Array(@plan&.dig(:steps))
      step_actions = steps.map { |step| step[:action] || step["action"] }.map(&:to_s).reject(&:blank?)
      step_actions == [ "final_answer" ]
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
        provider: @client.provider,
        model: @client.model,
        metrics: metrics,
        prompt_messages: @last_prompt_messages,
        prompt_layers: @last_prompt_messages ? prompt_layer_summary : nil,
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
      prompt_composer.system_prompt
    end

    def system_prompt_base
      PromptTemplate.render(
        "decider_system",
        action_catalog: action_catalog,
        action_keys: ACTIONS.keys.join(", ")
      )
    end

    def prompt_composer
      @prompt_composer ||= PromptComposer.new(base_system: system_prompt_base, context: @context, purpose: :decider)
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
        plan_steps: plan_steps_prompt,
        iteration: @iteration,
        max_iterations: @max_iterations,
        documents_count: documents.count,
        search_attempts: search_attempts,
        web_results_count: web_results.count,
        web_attempts: web_attempts,
        has_artifact: artifact? ? "có" : "chưa",
        artifact_status: latest_artifact_status || "chưa có",
        clarified: clarified? || answered_clarification? ? "rồi" : "chưa",
        working_notes: working_notes_prompt,
        recent_messages: recent_messages_prompt
      )
    end

    def markdown(action, reason, source)
      label = { "plan" => "theo plan", "model" => "model chọn", "fallback" => "luật dự phòng", "guard" => "giới hạn an toàn" }.fetch(source, source)
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

    def latest_artifact_status
      latest_artifact = Array(@state[:artifacts]).last
      latest_artifact&.dig(:status) || latest_artifact&.dig("status")
    end

    def web_results
      @state[:web_results] || []
    end

    def web_attempts
      @state[:web_attempts].to_i
    end

    def plan_steps_prompt
      steps = Array(@plan&.dig(:steps))
      return "Không có." if steps.empty?

      steps.each_with_index.map do |step, index|
        action = step[:action] || step["action"]
        title = step[:title] || step["title"]
        detail = step[:detail] || step["detail"]
        expected = step[:expected] || step["expected"]
        parts = [ "#{index + 1}. #{title} (`#{action}`)" ]
        parts << "làm gì: #{detail}" if detail.to_s.strip.present?
        parts << "mong đợi: #{expected}" if expected.to_s.strip.present?
        parts.join(" — ")
      end.join("\n")
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

    def clarification_policy
      @clarification_policy ||= ClarificationPolicy.new(message: @message, state: @state, context: @context)
    end
  end
end
