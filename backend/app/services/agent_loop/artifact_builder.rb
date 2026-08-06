module AgentLoop
  class ArtifactBuilder
    def initialize(intent:, documents:)
      @intent = intent
      @documents = documents
    end

    def call
      {
        tool: tool_name,
        artifact: artifact,
        output: markdown_output
      }
    end

    private

    def tool_name
      case @intent
      when "battlecard" then "battlecard_builder"
      when "proposal" then "proposal_outline_builder"
      when "follow_up" then "follow_up_email_builder"
      when "rfp_answer" then "rfp_answer_drafter"
      else "presales_advisor"
      end
    end

    def artifact
      case @intent
      when "battlecard" then battlecard
      when "proposal" then proposal_outline
      when "follow_up" then follow_up_email
      when "rfp_answer" then rfp_answer
      else presales_advice
      end
    end

    def markdown_output
      lines = ["### #{artifact[:title]}"]
      artifact[:bullets].each { |bullet| lines << "- #{bullet}" }
      lines << ""
      lines << "**Nguồn:** #{artifact[:sources].join(', ')}"
      lines.join("\n")
    end

    def battlecard
      {
        title: "Battlecard nhanh",
        bullets: [
          "Neo vào kết quả kinh doanh: rút ngắn thời gian phản hồi lead và tăng visibility pipeline.",
          "Điểm khác biệt: workflow presales gắn với tài liệu và template có nguồn.",
          "Câu hỏi phản biện: hệ thống hiện tại mất bao lâu để tạo proposal đúng ngữ cảnh?"
        ],
        sources: source_titles
      }
    end

    def proposal_outline
      {
        title: "Outline proposal",
        bullets: [
          "Executive summary theo pain point và mục tiêu mua hàng.",
          "Scope: discovery, tích hợp, workflow automation, enablement, rollout.",
          "Timeline 4 pha: assess, configure, pilot, scale.",
          "Assumptions và next steps để chốt meeting kỹ thuật."
        ],
        sources: source_titles
      }
    end

    def follow_up_email
      {
        title: "Email follow-up",
        bullets: [
          "Cảm ơn khách hàng về buổi discovery.",
          "Tóm tắt 2-3 pain point và liên kết với tài liệu liên quan.",
          "Đề xuất next step: workshop 30 phút về scope và success metrics."
        ],
        sources: source_titles
      }
    end

    def rfp_answer
      {
        title: "Bản nháp trả lời RFP",
        bullets: [
          "Trả lời ngắn gọn trước, sau đó thêm bằng chứng từ tài liệu.",
          "Đánh dấu giả định nếu câu hỏi thiếu thông tin deployment/security.",
          "Gắn mỗi claim với source để presales review nhanh."
        ],
        sources: source_titles
      }
    end

    def presales_advice
      {
        title: "Khuyến nghị presales",
        bullets: [
          "Làm rõ buyer pain, current process, timeline và decision criteria.",
          "Dùng case study/template gần nhất để tạo câu trả lời có bằng chứng.",
          "Nếu thiếu ngữ cảnh, hỏi lại về customer segment, product và deliverable mong muốn."
        ],
        sources: source_titles
      }
    end

    def source_titles
      @documents.map { |document| document[:title] }
    end
  end
end
