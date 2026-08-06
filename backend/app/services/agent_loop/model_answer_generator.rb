require "json"

module AgentLoop
  class ModelAnswerGenerator
    def initialize(brief:)
      @brief = brief
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
          content: synthesis_prompt
        }
      ]
    end

    def system_prompt
      <<~PROMPT
        You are a senior software presales assistant.
        Reply in Vietnamese.
        Write Markdown.
        Synthesize only the provided final brief.
        Do not invent sources, numbers, or capabilities.
        Keep the answer concise, practical, and sales-useful.
        If information is missing, ask for the missing details at the end.
        Keep dummy source names visible so the user can see what evidence was used.
      PROMPT
    end

    def synthesis_prompt
      <<~PROMPT
        Final brief:
        #{JSON.pretty_generate(@brief)}

        Create the final chat answer in this structure:
        1. Short direct answer.
        2. Recommended presales content as bullets or a compact table.
        3. Evidence used.
        4. Missing details to ask, only if the brief contains missing_context.
      PROMPT
    end
  end
end
