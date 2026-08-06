module AgentLoop
  class ToolRouter
    def initialize(intent:, message:)
      @intent = intent
      @message = message
    end

    def call
      documents = DummyDocumentSearch.new(query: @message).call

      case @intent
      when "battlecard"
        tools = ["document_search", "battlecard_builder"]
        artifact = battlecard(documents)
      when "proposal"
        tools = ["document_search", "proposal_outline_builder"]
        artifact = proposal_outline(documents)
      when "follow_up"
        tools = ["document_search", "follow_up_email_builder"]
        artifact = follow_up_email(documents)
      when "rfp_answer"
        tools = ["document_search", "rfp_answer_drafter"]
        artifact = rfp_answer(documents)
      else
        tools = ["document_search", "presales_advisor"]
        artifact = presales_advice(documents)
      end

      { tools: tools, documents: documents, artifact: artifact }
    end

    private

    def battlecard(documents)
      {
        title: "Battlecard nhanh",
        bullets: [
          "Neo vao ket qua kinh doanh: rut ngan lead response time, tang visibility pipeline.",
          "Diem khac biet: workflow presales gan voi tai lieu va template co nguon.",
          "Cau hoi phan bien: he thong hien tai mat bao lau de tao proposal dung ngu canh?"
        ],
        sources: documents.map { |document| document[:title] }
      }
    end

    def proposal_outline(documents)
      {
        title: "Proposal outline",
        bullets: [
          "Executive summary theo pain point va muc tieu mua hang.",
          "Scope: discovery, integration, workflow automation, enablement, rollout.",
          "Timeline 4 pha: assess, configure, pilot, scale.",
          "Assumptions va next steps de chot meeting ky thuat."
        ],
        sources: documents.map { |document| document[:title] }
      }
    end

    def follow_up_email(documents)
      {
        title: "Email follow-up",
        bullets: [
          "Cam on khach hang ve buoi discovery.",
          "Tom tat 2-3 pain points va tie-in voi tai lieu lien quan.",
          "De xuat next step: 30 phut workshop scope va success metrics."
        ],
        sources: documents.map { |document| document[:title] }
      }
    end

    def rfp_answer(documents)
      {
        title: "RFP answer draft",
        bullets: [
          "Tra loi ngan gon truoc, sau do them bang chung tu tai lieu.",
          "Danh dau gia dinh neu cau hoi thieu thong tin deployment/security.",
          "Gan moi claim voi source de presales review nhanh."
        ],
        sources: documents.map { |document| document[:title] }
      }
    end

    def presales_advice(documents)
      {
        title: "Presales recommendation",
        bullets: [
          "Lam ro buyer pain, current process, timeline, va decision criteria.",
          "Dung case study/template gan nhat de tao cau tra loi co bang chung.",
          "Neu thieu ngu canh, hoi lai ve customer segment, product, va deliverable mong muon."
        ],
        sources: documents.map { |document| document[:title] }
      }
    end
  end
end
