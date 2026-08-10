require "json"

module AgentLoop
  class ModelAnswerGenerator
    def initialize(brief:, context: {}, client: LocalModelClient.new)
      @brief = brief
      @context = context
      @client = client
    end

    attr_reader :client

    def prompt_messages
      messages
    end

    def call
      @client.chat(messages: messages)
    end

    def call_with_metrics
      @client.chat_with_metrics(messages: messages)
    end

    private

    def messages
      [
        {
          role: "system",
          content: system_prompt
        },
        {
          role: "user",
          content: synthesis_prompt
        }
      ]
    end

    def system_prompt
      PromptComposer.new(
        base_system: PromptTemplate.render("answer_system"),
        context: @context,
        purpose: :answer
      ).system_prompt
    end

    def synthesis_prompt
      PromptTemplate.render("answer_user", brief: JSON.pretty_generate(@brief))
    end
  end
end
