module AgentLoop
  # Generates a short conversation title from the first exchange using the local model.
  class ConversationTitler
    MAX_LENGTH = 80

    def initialize(conversation:, latest_answer: nil, client: LocalModelClient.new)
      @conversation = conversation
      @latest_answer = latest_answer
      @client = client
    end

    def call
      first_user = @conversation.agent_messages.where(role: "user").order(:id).first
      return if first_user.blank?

      raw = @client.chat(messages: messages(first_user.content), temperature: 0.3)
      sanitize(raw)
    end

    private

    def messages(user_content)
      [
        {
          role: "system",
          content: "Bạn đặt tiêu đề ngắn gọn cho đoạn chat dựa trên YÊU CẦU của người dùng. " \
                   "Tóm tắt chủ đề/mục tiêu trong câu hỏi của người dùng; KHÔNG dựa vào câu trả lời của trợ lý, " \
                   "KHÔNG đặt tiêu đề kiểu 'cần thêm thông tin' hay 'cần làm rõ'. " \
                   "Chỉ trả về đúng tiêu đề, tối đa 6 từ, tiếng Việt có dấu, không dùng dấu ngoặc kép, " \
                   "không dấu chấm cuối, không giải thích."
        },
        {
          role: "user",
          content: "Yêu cầu của người dùng:\n#{user_content}\n\nĐặt một tiêu đề ngắn tóm tắt yêu cầu này."
        }
      ]
    end

    def sanitize(text)
      title = text.to_s.strip.lines.first.to_s.strip
      title = title.sub(/\A(tiêu đề|title)\s*[:：-]\s*/i, "")
      title = title.gsub(/\A["'“”‘’]+|["'“”‘’]+\z/, "")
      title = title.sub(/[.。]+\z/, "").strip
      return if title.blank?

      title[0, MAX_LENGTH]
    end
  end
end
