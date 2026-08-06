module AgentLoop
  class FinalBriefBuilder
    def initialize(user_message:, intent:, context:, tool_result:)
      @user_message = user_message
      @intent = intent
      @context = context
      @tool_result = tool_result
    end

    def call
      {
        request: @user_message,
        intent: @intent,
        customer: conversation[:customer_name],
        industry: conversation[:industry],
        evidence: evidence,
        draft: draft,
        missing_context: missing_context
      }
    end

    private

    def evidence
      @tool_result[:documents].map do |document|
        {
          title: document[:title],
          type: document[:type],
          snippet: document[:snippet]
        }
      end
    end

    def conversation
      @context[:conversation] || {}
    end

    def draft
      artifact = @tool_result[:artifact]
      return nil unless artifact

      {
        title: artifact[:title],
        bullets: artifact[:bullets],
        sources: artifact[:sources]
      }
    end

    def missing_context
      return [] if @user_message.split.length >= 8

      ["tên sản phẩm", "loại khách hàng", "output mong muốn"]
    end
  end
end
