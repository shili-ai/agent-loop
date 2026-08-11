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
        actions: Array(plan[:actions]),
        output: plan[:output]
      }
    end

    def normalize(parsed, fallback)
      intent = INTENTS.include?(parsed[:intent]) ? parsed[:intent] : fallback[:intent]
      actions = Array(parsed[:actions]).map(&:to_s).select { |action| ACTIONS.include?(action) }.uniq
      actions = fallback[:actions] if actions.empty?
      actions << "final_answer" unless actions.include?("final_answer")
      goal = parsed[:goal].to_s.strip.presence || fallback[:goal]
      understanding = parsed[:understanding].to_s.strip.presence || fallback[:understanding]

      {
        understanding: understanding,
        intent: intent,
        goal: goal,
        actions: actions,
        output: markdown_output(understanding, intent, goal, actions)
      }
    end

    def parse(content)
      data = JSON.parse(extract_json(content))
      {
        understanding: data["understanding"],
        intent: data["intent"].to_s.strip,
        goal: data["goal"],
        actions: data["actions"] || data["steps"]
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

    def markdown_output(understanding, intent, goal, actions)
      lines = [
        "### Phân tích bằng model",
        "- Mình hiểu: #{understanding}",
        "- Intent: `#{intent}`",
        "- Mục tiêu: #{goal}",
        "- Action dự kiến:"
      ]
      actions.each { |action| lines << "  - `#{action}`" }
      lines.join("\n")
    end

    def fallback_output(fallback, error)
      [
        "### Phân tích fallback",
        "- Model phân tích lỗi: #{error.message}",
        "- Intent: `#{fallback[:intent]}`",
        "- Mục tiêu: #{fallback[:goal]}",
        "- Action dự kiến:",
        *Array(fallback[:actions]).map { |action| "  - `#{action}`" }
      ].join("\n")
    end
  end
end
