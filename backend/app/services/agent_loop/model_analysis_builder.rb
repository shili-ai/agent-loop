require "json"

module AgentLoop
  class ModelAnalysisBuilder
    INTENTS = %w[
      proposal
      battlecard
      follow_up
      rfp_answer
      web_search
      document_search
      presales_advice
    ].freeze

    ACTIONS = ModelActionDecider::ACTIONS.keys.freeze

    def initialize(message:, context:, client: LocalModelClient.new)
      @message = message
      @context = context
      @client = client
    end

    attr_reader :client

    def prompt_messages
      messages
    end

    def prompt_layer_summary
      prompt_composer.prompt_layer_summary
    end

    def call_with_metrics
      result = @client.chat_with_metrics(messages: messages, temperature: 0, format: "json")
      parsed = parse(result[:content])
      fallback = fallback_analysis
      analysis = normalize(parsed, fallback)

      {
        analysis: analysis.merge(source: "model"),
        metrics: result[:metrics],
        raw: result[:content]
      }
    rescue StandardError => e
      fallback = fallback_analysis
      {
        analysis: fallback.merge(
          source: "fallback",
          error: e.message,
          output: fallback_output(fallback, e)
        ),
        metrics: {
          provider: @client.provider,
          model: @client.model,
          status: "failed"
        },
        raw: nil
      }
    end

    private

    def fallback_analysis
      intent = IntentClassifier.new(message: @message).call
      plan = LoopPlanBuilder.new(intent: intent, message: @message).call
      {
        understanding: "Mình đọc yêu cầu và dùng luật dự phòng để phân loại vì model phân tích chưa sẵn sàng.",
        intent: intent,
        goal: plan[:goal],
        keywords: fallback_keywords,
        steps: Array(plan[:steps]),
        actions: Array(plan[:actions]),
        output: plan[:output]
      }
    end

    # Fallback khi model không trả keyword: tách từ nhưng LOẠI từ dừng tiếng Việt
    # để không ra token rác như "trên/mình/liệu".
    STOP_WORDS = %w[
      trên dưới trong ngoài mình tôi bạn liệu giúp cho các những một này nọ kia
      và hoặc của với về theo là như thì mà nên cần muốn được rồi đang sẽ đã
      gì sao nào đâu nhỉ nhé ạ ơi cái việc thông tin hãy vui lòng cùng khi vì
    ].freeze

    def fallback_keywords
      @message.to_s.downcase
        .scan(/[\p{L}\p{N}]+/)
        .select { |word| word.length >= 3 && !STOP_WORDS.include?(word) }
        .uniq
        .first(8)
    end

    def normalize(parsed, fallback)
      intent = INTENTS.include?(parsed[:intent]) ? parsed[:intent] : fallback[:intent]
      goal = parsed[:goal].to_s.strip.presence || fallback[:goal]
      understanding = parsed[:understanding].to_s.strip.presence || fallback[:understanding]

      steps = normalize_steps(parsed[:steps])
      steps = normalize_steps(fallback[:steps]) if steps.empty?
      steps = ensure_final_step(steps)
      actions = steps.map { |step| step[:action] }.uniq
      keywords = normalize_keywords(parsed[:keywords]).presence || fallback[:keywords]

      {
        understanding: understanding,
        intent: intent,
        goal: goal,
        keywords: keywords,
        steps: steps,
        actions: actions,
        output: markdown_output(understanding, intent, goal, steps, keywords)
      }
    end

    def normalize_keywords(raw)
      Array(raw)
        .flat_map { |value| value.is_a?(Array) ? value : [ value ] }
        .map { |value| value.to_s.strip.gsub(/\s+/, " ") }
        .reject { |value| value.blank? || value.length < 2 }
        .uniq
        .first(8)
    end

    # Chấp nhận cả format mới (steps có detail) lẫn format cũ (mảng action string).
    def normalize_steps(raw)
      Array(raw).filter_map do |item|
        if item.is_a?(Hash)
          action = (item[:action] || item["action"]).to_s.strip
          next unless ACTIONS.include?(action)

          {
            action: action,
            title: (item[:title] || item["title"]).to_s.strip.presence || default_title(action),
            detail: (item[:detail] || item["detail"]).to_s.strip.presence || ACTIONS_DETAIL_FALLBACK[action],
            expected: (item[:expected] || item["expected"]).to_s.strip.presence
          }
        else
          action = item.to_s.strip
          next unless ACTIONS.include?(action)

          { action: action, title: default_title(action), detail: ACTIONS_DETAIL_FALLBACK[action], expected: nil }
        end
      end
    end

    def ensure_final_step(steps)
      return steps if steps.any? { |step| step[:action] == "final_answer" }

      steps + [ { action: "final_answer", title: default_title("final_answer"), detail: ACTIONS_DETAIL_FALLBACK["final_answer"], expected: nil } ]
    end

    def default_title(action)
      {
        "search_documents" => "Tra kho tài liệu nội bộ",
        "web_search" => "Tìm thông tin trên web",
        "draft_artifact" => "Soạn bản nháp",
        "verify_artifact" => "Kiểm tra bản nháp",
        "revise_artifact" => "Sửa lại bản nháp",
        "ask_clarification" => "Hỏi lại để làm rõ",
        "final_answer" => "Tổng hợp câu trả lời cuối"
      }.fetch(action, action)
    end

    ACTIONS_DETAIL_FALLBACK = {
      "search_documents" => "Mình tra kho tài liệu nội bộ để tìm dẫn chứng liên quan.",
      "web_search" => "Mình tìm thông tin mới hoặc ngoài kho nội bộ trên web.",
      "draft_artifact" => "Mình soạn bản nháp dựa trên tài liệu đã có.",
      "verify_artifact" => "Mình kiểm tra bản nháp về cấu trúc, nội dung và nguồn.",
      "revise_artifact" => "Mình sửa bản nháp theo điểm còn thiếu.",
      "ask_clarification" => "Mình hỏi lại người dùng để làm rõ phạm vi.",
      "final_answer" => "Mình tổng hợp toàn bộ thành câu trả lời cuối."
    }.freeze

    def parse(content)
      data = JSON.parse(extract_json(content))
      {
        understanding: data["understanding"],
        intent: data["intent"].to_s.strip,
        goal: data["goal"],
        keywords: data["keywords"],
        steps: data["steps"] || data["actions"]
      }
    end

    def extract_json(content)
      text = content.to_s.strip
      return text if text.start_with?("{")

      start = text.index("{")
      finish = text.rindex("}")
      raise "Model không trả JSON phân tích hợp lệ" unless start && finish && finish > start

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

    def prompt_composer
      @prompt_composer ||= PromptComposer.new(
        base_system: PromptTemplate.render("analysis_system"),
        context: @context,
        purpose: :analysis
      )
    end

    def user_prompt
      <<~PROMPT
        Yêu cầu người dùng:
        #{@message}

        Ngữ cảnh gần đây:
        #{recent_messages_prompt}

        Hãy phân tích yêu cầu, chọn intent và lập plan action.
      PROMPT
    end

    def recent_messages_prompt
      recent_messages = Array(@context[:recent_messages]).last(6)
      lines = []
      if @context[:project]
        project = @context[:project]
        lines << "- project: #{project[:title]} | #{project[:shared_context].to_s.truncate(500)}"
      end

      message_lines = recent_messages.map do |message|
        role = message[:role] || message["role"]
        content = message[:content] || message["content"]
        "- #{role}: #{content.to_s.truncate(500)}"
      end
      lines.concat(message_lines)
      lines.presence&.join("\n") || "Không có."
    end

    def markdown_output(understanding, intent, goal, steps, keywords = [])
      lines = [
        "### Phân tích bằng model",
        "- Mình hiểu: #{understanding}",
        "- Intent: `#{intent}`",
        "- Mục tiêu: #{goal}"
      ]
      lines << "- Từ khoá tìm kiếm: #{Array(keywords).join(', ')}" if Array(keywords).any?
      lines << "- Kế hoạch chi tiết:"
      lines.concat(steps_markdown(steps))
      lines.join("\n")
    end

    def steps_markdown(steps)
      steps.each_with_index.flat_map do |step, index|
        block = [ "  #{index + 1}. **#{step[:title]}** (`#{step[:action]}`)" ]
        block << "     - Làm gì: #{step[:detail]}" if step[:detail].present?
        block << "     - Mong đợi: #{step[:expected]}" if step[:expected].present?
        block
      end
    end

    def fallback_output(fallback, error)
      [
        "### Phân tích fallback",
        "- Model phân tích lỗi: #{error.message}",
        "- Intent: `#{fallback[:intent]}`",
        "- Mục tiêu: #{fallback[:goal]}",
        "- Kế hoạch chi tiết:",
        *steps_markdown(normalize_steps(fallback[:steps]))
      ].join("\n")
    end
  end
end
