module AgentLoop
  class ContextBuilder
    MAX_MESSAGES = 8

    def initialize(conversation:)
      @conversation = conversation
    end

    def call
      {
        conversation: {
          id: @conversation.id,
          title: @conversation.title,
          industry: @conversation.industry,
          customer_name: @conversation.customer_name
        },
        recent_messages: recent_messages
      }
    end

    private

    def recent_messages
      @conversation.agent_messages.order(created_at: :desc).limit(MAX_MESSAGES).reverse.map do |message|
        { role: message.role, content: message.content }
      end
    end
  end
end
