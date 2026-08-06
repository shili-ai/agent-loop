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
      lines << "**Sources:** #{artifact[:sources].join(', ')}"
      lines.join("\n")
    end

    def battlecard
      {
        title: "Battlecard nhanh",
        bullets: [
          "Neo vao ket qua kinh doanh: rut ngan lead response time, tang visibility pipeline.",
          "Diem khac biet: workflow presales gan voi tai lieu va template co nguon.",
          "Cau hoi phan bien: he thong hien tai mat bao lau de tao proposal dung ngu canh?"
        ],
        sources: source_titles
      }
    end

    def proposal_outline
      {
        title: "Proposal outline",
        bullets: [
          "Executive summary theo pain point va muc tieu mua hang.",
          "Scope: discovery, integration, workflow automation, enablement, rollout.",
          "Timeline 4 pha: assess, configure, pilot, scale.",
          "Assumptions va next steps de chot meeting ky thuat."
        ],
        sources: source_titles
      }
    end

    def follow_up_email
      {
        title: "Email follow-up",
        bullets: [
          "Cam on khach hang ve buoi discovery.",
          "Tom tat 2-3 pain points va tie-in voi tai lieu lien quan.",
          "De xuat next step: 30 phut workshop scope va success metrics."
        ],
        sources: source_titles
      }
    end

    def rfp_answer
      {
        title: "RFP answer draft",
        bullets: [
          "Tra loi ngan gon truoc, sau do them bang chung tu tai lieu.",
          "Danh dau gia dinh neu cau hoi thieu thong tin deployment/security.",
          "Gan moi claim voi source de presales review nhanh."
        ],
        sources: source_titles
      }
    end

    def presales_advice
      {
        title: "Presales recommendation",
        bullets: [
          "Lam ro buyer pain, current process, timeline, va decision criteria.",
          "Dung case study/template gan nhat de tao cau tra loi co bang chung.",
          "Neu thieu ngu canh, hoi lai ve customer segment, product, va deliverable mong muon."
        ],
        sources: source_titles
      }
    end

    def source_titles
      @documents.map { |document| document[:title] }
    end
  end
end
