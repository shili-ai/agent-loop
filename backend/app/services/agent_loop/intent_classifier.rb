module AgentLoop
  class IntentClassifier
    INTENTS = {
      "proposal" => ["proposal", "de xuat", "đề xuất", "bao gia", "báo giá", "scope"],
      "battlecard" => ["battlecard", "doi thu", "đối thủ", "compare", "so sanh", "so sánh"],
      "follow_up" => ["follow up", "follow-up", "email", "mail", "gui khach", "gửi khách"],
      "rfp_answer" => ["rfp", "rfi", "questionnaire", "tra loi", "trả lời"],
      "web_search" => ["web", "internet", "online", "google", "tin mới", "mới nhất", "hiện nay", "thị trường", "website"],
      "document_search" => ["tim", "tìm", "tai lieu", "tài liệu", "case study", "reference"]
    }.freeze

    def initialize(message:)
      @message = message.to_s.downcase
    end

    def call
      INTENTS.each do |intent, keywords|
        return intent if keywords.any? { |keyword| @message.include?(keyword) }
      end

      "presales_advice"
    end
  end
end
