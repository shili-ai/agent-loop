module AgentLoop
  class IntentNoteBuilder
    LABELS = {
      "proposal" => "Lập proposal / outline",
      "battlecard" => "Tạo battlecard",
      "follow_up" => "Viết follow-up",
      "rfp_answer" => "Soạn câu trả lời RFP/RFI"
    }.freeze

    def initialize(intent:, message:)
      @intent = intent
      @message = message
    end

    def call
      <<~MARKDOWN.strip
        ### Ý định
        - Phân loại: `#{@intent}`
        - Hướng xử lý: #{LABELS.fetch(@intent, "Tư vấn presales tổng quát")}
        - Tín hiệu từ người dùng: "#{@message.truncate(120)}"
      MARKDOWN
    end
  end
end
