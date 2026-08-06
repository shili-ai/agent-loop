module AgentLoop
  class ContextNoteBuilder
    def initialize(context:)
      @context = context
    end

    def call
      lines = []
      lines << "### Chat context"
      lines << "- Industry: #{value(conversation[:industry])}"
      lines << "- Customer: #{value(conversation[:customer_name])}"
      lines << "- Recent messages: #{recent_messages.count}"
      lines << ""
      lines << "Agent se dung context nay de giu cau tra loi sat voi chat hien tai."
      lines.join("\n")
    end

    private

    def recent_messages
      @context[:recent_messages] || []
    end

    def conversation
      @context[:conversation] || {}
    end

    def value(item)
      item.presence || "chua co"
    end
  end
end
