module AgentLoop
  class DummyDocumentSearch
    DOCUMENTS = [
      {
        title: "CRM Modernization Case Study",
        type: "case_study",
        source: "dummy://documents/crm-modernization",
        snippet: "A mid-market software vendor reduced lead response time by 42% after integrating CRM workflows, proposal templates, and activity analytics."
      },
      {
        title: "SaaS Security One Pager",
        type: "one_pager",
        source: "dummy://documents/saas-security",
        snippet: "Covers SSO, RBAC, audit logs, data retention, encryption at rest, and deployment controls for enterprise SaaS buyers."
      },
      {
        title: "Presales Discovery Playbook",
        type: "playbook",
        source: "dummy://documents/discovery-playbook",
        snippet: "Discovery questions should isolate business pain, current workflow, decision criteria, timeline, stakeholders, and success metrics."
      },
      {
        title: "Implementation Proposal Template",
        type: "template",
        source: "dummy://documents/implementation-proposal",
        snippet: "Recommended proposal structure: executive summary, pain points, solution modules, delivery plan, assumptions, risks, timeline, and next steps."
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
