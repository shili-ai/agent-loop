module AgentLoop
  class Runner
    def self.enqueue(conversation:, content:)
      user_message = conversation.agent_messages.create!(role: "user", content: content)
      run = conversation.agent_runs.create!(user_message: user_message, status: "running")

      Thread.new do
        Rails.application.executor.wrap do
          ActiveRecord::Base.connection_pool.with_connection do
            new(conversation: conversation, content: content, run: run).call
          end
        end
      end

      run
    end

    def initialize(conversation:, content:, run: nil)
      @conversation = conversation
      @content = content
      @run = run
    end

    def call
      run = @run || create_run

      context = ContextBuilder.new(conversation: @conversation).call
      create_step(run, "context", "Doc chat context", "Loaded recent conversation and customer metadata.", context)

      intent = IntentClassifier.new(message: @content).call
      run.update!(intent: intent)
      create_step(run, "reasoning", "Phan loai intent", "Detected intent: #{intent}.", { intent: intent })

      tool_result = ToolRouter.new(intent: intent, message: @content).call
      create_step(run, "tool", "Goi dummy tools", "Executed #{tool_result[:tools].join(', ')}.", tool_result)

      model_answer = generate_model_answer(run, intent, tool_result, context)
      answer = ResponseComposer.new(
        intent: intent,
        tool_result: tool_result,
        user_message: @content,
        model_answer: model_answer
      ).call
      assistant_message = @conversation.agent_messages.create!(role: "assistant", content: answer)
      run.update!(assistant_message: assistant_message, status: "completed")
      create_step(
        run,
        "answer",
        "Tong hop cau tra loi",
        "Saved assistant response for the chat UI.",
        { message_id: assistant_message.id, output: answer }
      )

      run
    rescue StandardError => e
      run&.update!(status: "failed")
      create_step(
        run,
        "error",
        "Agent loop failed",
        "Agent stopped before completing the answer.",
        { error: e.message }
      ) if run
      Rails.logger.error("[AgentLoop::Runner] #{e.class}: #{e.message}")
      nil
    end

    private

    def create_run
      user_message = @conversation.agent_messages.create!(role: "user", content: @content)
      @conversation.agent_runs.create!(user_message: user_message, status: "running")
    end

    def generate_model_answer(run, intent, tool_result, context)
      generator = ModelAnswerGenerator.new(
        intent: intent,
        tool_result: tool_result,
        user_message: @content,
        context: context
      )
      step = create_step(
        run,
        "llm",
        "Goi local model",
        "Calling #{generator.client.model} through Ollama.",
        { provider: "ollama", model: generator.client.model, output: nil, status: "running" }
      )
      answer = generator.call
      step.update!(
        summary: "Generated answer with #{generator.client.model}.",
        data: { provider: "ollama", model: generator.client.model, output: answer, status: "completed" }
      )
      answer
    rescue StandardError => e
      step&.update!(
        title: "Local model fallback",
        summary: "Local model failed, used deterministic composer.",
        data: { error: e.message, output: nil, status: "failed" }
      )
      nil
    end

    def create_step(run, kind, title, summary, data)
      run.agent_steps.create!(
        position: run.agent_steps.count + 1,
        kind: kind,
        title: title,
        summary: summary,
        data: data
      )
    end
  end
end
