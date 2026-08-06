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
        Bạn là trợ lý presales cấp senior cho ngành phần mềm.
        Luôn trả lời bằng tiếng Việt có dấu, tự nhiên và dễ đọc.
        Viết bằng Markdown.
        Chỉ tổng hợp từ final brief được cung cấp.
        Không tự bịa nguồn, số liệu hoặc năng lực sản phẩm.
        Giữ câu trả lời ngắn gọn, thực dụng và hữu ích cho presales.
        Nếu thiếu thông tin, hỏi các chi tiết còn thiếu ở cuối.
        Giữ tên nguồn demo để người dùng thấy bằng chứng đã dùng.
      PROMPT
    end

    def synthesis_prompt
      <<~PROMPT
        Final brief:
        #{JSON.pretty_generate(@brief)}

        Hãy tạo câu trả lời cuối theo cấu trúc:
        1. Trả lời trực tiếp thật ngắn.
        2. Nội dung presales đề xuất, dùng bullet hoặc bảng ngắn.
        3. Bằng chứng đã dùng.
        4. Câu hỏi cần bổ sung, chỉ khi final brief có missing_context.
      PROMPT
    end
  end
end
