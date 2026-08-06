require "json"

module AgentLoop
  class ModelAnswerGenerator
    def initialize(intent:, tool_result:, user_message:, context:)
      @intent = intent
      @tool_result = tool_result
      @user_message = user_message
      @context = context
      @client = LocalModelClient.new
    end

    attr_reader :client

    def call
      @client.chat(messages: messages)
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
          content: user_prompt
        }
      ]
    end

    def system_prompt
      <<~PROMPT
        You are a senior software presales assistant.
        Reply in Vietnamese.
        Be concise, practical, and sales-useful.
        Use only the provided tool results as evidence.
        If information is missing, ask for the missing details at the end.
        Keep dummy source names visible so the user can see what evidence was used.
      PROMPT
    end

    def user_prompt
      <<~PROMPT
        User request:
        #{@user_message}

        Conversation context:
        #{format_context}

        Detected intent:
        #{@intent}

        Tool result:
        #{JSON.pretty_generate(@tool_result)}

        Write the final assistant answer for the chat.
      PROMPT
    end

    def format_context
      JSON.pretty_generate(@context)
    end
  end
end
