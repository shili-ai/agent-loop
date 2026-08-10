class AgentSkill < ApplicationRecord
  DEFAULT_PRESALES_KEY = "presales".freeze

  has_many :agent_skill_assignments, dependent: :destroy

  validates :key, presence: true, uniqueness: true
  validates :name, presence: true

  def self.default_presales!
    find_or_create_by!(key: DEFAULT_PRESALES_KEY) do |skill|
      skill.name = "Presales"
      skill.description = "Tư vấn presales phần mềm: discovery, proposal, RFP, follow-up, battlecard."
      skill.priority = 50
      skill.analysis_prompt = <<~PROMPT
        Bạn đang hỗ trợ trong miền presales phần mềm.
        Khi phân tích yêu cầu, hãy ưu tiên hiểu các intent như proposal, battlecard, follow_up, rfp_answer, document_search, web_search và presales_advice.
        Nếu yêu cầu ngắn/mơ hồ nhưng có dấu hiệu về khách hàng, RFP, proposal, discovery, follow-up hoặc tài liệu bán hàng, hãy suy luận theo ngữ cảnh presales.
      PROMPT
      skill.decider_prompt = <<~PROMPT
        Với skill presales:
        - Muốn soạn bản nháp presales thì nên có bằng chứng trước từ tài liệu hoặc web.
        - Ưu tiên search_documents khi cần case study, one-pager, playbook, template hoặc tài liệu đã upload.
        - Ưu tiên web_search khi người dùng hỏi thông tin mới, đối thủ, thị trường, website hoặc nguồn ngoài.
        - Nếu thiếu customer segment, sản phẩm, người nhận hoặc dạng output, có thể ask_clarification.
      PROMPT
      skill.answer_prompt = <<~PROMPT
        Bạn là trợ lý presales cấp senior cho ngành phần mềm.
        Câu trả lời cần ngắn gọn, thực dụng, có thể dùng ngay.
        Ưu tiên cấu trúc: trả lời trực tiếp, nội dung presales đề xuất, bằng chứng đã dùng, câu hỏi bổ sung nếu thật cần.
        Không bịa nguồn, không bịa số liệu, không tự tạo năng lực sản phẩm.
        Nếu dùng tài liệu hoặc web, nhắc nguồn ngắn gọn theo final brief.
      PROMPT
      skill.clarification_prompt = <<~PROMPT
        Khi cần hỏi làm rõ trong presales, ưu tiên các thông tin ảnh hưởng trực tiếp tới output:
        dạng đầu ra, đối tượng nhận, pain point, sản phẩm, customer segment, phạm vi, giọng văn và mức bằng chứng cần dùng.
      PROMPT
      skill.tool_policy = {
        preferred_tools: [ "document_search", "web_search", "draft_artifact" ],
        constraints: [ "cite_sources", "ask_when_missing_context", "do_not_invent_sources" ]
      }
    end
  end
end
