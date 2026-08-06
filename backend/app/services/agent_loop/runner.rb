module AgentLoop
  class Runner
    def initialize(conversation:, content:)
      @conversation = conversation
      @content = content
    end

    def call
      run = nil

      AgentRun.transaction do
        user_message = @conversation.agent_messages.create!(role: "user", content: @content)
        run = @conversation.agent_runs.create!(user_message: user_message, status: "running")

        context = ContextBuilder.new(conversation: @conversation).call
        create_step(run, "context", "Doc chat context", "Loaded recent conversation and customer metadata.", context)

        intent = IntentClassifier.new(message: @content).call
        run.update!(intent: intent)
        create_step(run, "reasoning", "Phan loai intent", "Detected intent: #{intent}.", { intent: intent })

        tool_result = ToolRouter.new(intent: intent, message: @content).call
        create_step(run, "tool", "Goi dummy tools", "Executed #{tool_result[:tools].join(', ')}.", tool_result)

        answer = ResponseComposer.new(intent: intent, tool_result: tool_result, user_message: @content).call
        assistant_message = @conversation.agent_messages.create!(role: "assistant", content: answer)
        run.update!(assistant_message: assistant_message, status: "completed")
        create_step(run, "answer", "Tong hop cau tra loi", "Saved assistant response for the chat UI.", { message_id: assistant_message.id })

        run
      end
    rescue StandardError => e
      run&.update!(status: "failed")
      raise e
    end

    private

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
