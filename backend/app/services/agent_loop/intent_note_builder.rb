module AgentLoop
  class IntentNoteBuilder
    LABELS = {
      "proposal" => "Lap proposal / outline",
      "battlecard" => "Tao battlecard",
      "follow_up" => "Viet follow-up",
      "rfp_answer" => "Draft cau tra loi RFP/RFI"
    }.freeze

    def initialize(intent:, message:)
      @intent = intent
      @message = message
    end

    def call
      <<~MARKDOWN.strip
        ### Intent
        - Detected: `#{@intent}`
        - Huong xu ly: #{LABELS.fetch(@intent, "Tu van presales tong quat")}
        - Tin hieu tu user: "#{@message.truncate(120)}"
      MARKDOWN
    end
  end
end
