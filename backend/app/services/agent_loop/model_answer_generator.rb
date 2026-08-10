require "json"

module AgentLoop
  class ModelAnswerGenerator
    def initialize(brief:, client: LocalModelClient.new)
      @brief = brief
      @client = client
    end

    attr_reader :client

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
      PromptTemplate.render("answer_system")
    end

    def synthesis_prompt
      PromptTemplate.render("answer_user", brief: JSON.pretty_generate(@brief))
    end
  end
end
