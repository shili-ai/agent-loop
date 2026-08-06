module AgentLoop
  class ContextNoteBuilder
    def initialize(context:)
      @context = context
    end

    def call
      lines = []
      lines << "### Ngữ cảnh chat"
      lines << "- Ngành: #{value(conversation[:industry])}"
      lines << "- Khách hàng: #{value(conversation[:customer_name])}"
      lines << "- Tin nhắn gần đây: #{recent_messages.count}"
      lines << ""
      lines << "Agent sẽ dùng ngữ cảnh này để giữ câu trả lời sát với chat hiện tại."
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
      item.presence || "chưa có"
    end
  end
end
