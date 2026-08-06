module AgentLoop
  class DummyDocumentSearch
    DOCUMENTS = [
      {
        title: "Case study hiện đại hoá CRM",
        type: "case_study",
        source: "dummy://documents/crm-modernization",
        snippet: "Một công ty phần mềm mid-market giảm 42% thời gian phản hồi lead sau khi tích hợp workflow CRM, template proposal và phân tích hoạt động."
      },
      {
        title: "One-pager bảo mật SaaS",
        type: "one_pager",
        source: "dummy://documents/saas-security",
        snippet: "Bao gồm SSO, RBAC, audit log, lưu trữ dữ liệu, mã hoá at-rest và kiểm soát triển khai cho khách hàng enterprise SaaS."
      },
      {
        title: "Playbook discovery cho presales",
        type: "playbook",
        source: "dummy://documents/discovery-playbook",
        snippet: "Câu hỏi discovery nên làm rõ business pain, workflow hiện tại, decision criteria, timeline, stakeholders và success metrics."
      },
      {
        title: "Template proposal triển khai",
        type: "template",
        source: "dummy://documents/implementation-proposal",
        snippet: "Cấu trúc proposal đề xuất: executive summary, pain points, solution modules, delivery plan, assumptions, risks, timeline và next steps."
      }
    ].freeze

    def initialize(query:)
      @query = query.to_s.downcase
    end

    def call
      ranked_documents.first(3)
    end

    private

    def ranked_documents
      DOCUMENTS.sort_by do |document|
        -score(document)
      end
    end

    def score(document)
      haystack = [document[:title], document[:type], document[:snippet]].join(" ").downcase
      @query.split.count { |term| haystack.include?(term) }
    end
  end
end
