module AgentLoop
  class FinalBriefBuilder
    def initialize(user_message:, intent:, context:, tool_result:)
      @user_message = user_message
      @intent = intent
      @context = context
      @tool_result = tool_result
    end

    def call
      {
        request: @user_message,
        intent: @intent,
        customer: conversation[:customer_name],
        industry: conversation[:industry],
        project: project,
        working_notes: working_notes,
        evidence: evidence,
        web_evidence: web_evidence,
        web_pages: web_pages,
        draft: draft,
        missing_context: missing_context
      }
    end

    private

    def evidence
      @tool_result[:documents].map do |document|
        {
          title: document[:title],
          type: document[:type],
          snippet: document[:snippet]
        }
      end
    end

    def working_notes
      Array(@tool_result[:working_notes]).map do |note|
        {
          action: note[:action] || note["action"],
          summary: note[:summary] || note["summary"],
          evidence_count: note[:evidence_count] || note["evidence_count"],
          raw_count: note[:raw_count] || note["raw_count"],
          titles: note[:titles] || note["titles"],
          candidate_titles: note[:candidate_titles] || note["candidate_titles"]
        }.compact
      end
    end

    def web_evidence
      Array(@tool_result[:web_results]).map do |result|
        {
          title: result[:title],
          url: result[:url],
          snippet: result[:snippet],
          source: result[:source]
        }
      end
    end

    def web_pages
      Array(@tool_result[:web_pages]).map do |page|
        {
          title: page[:title],
          url: page[:url],
          description: page[:description],
          headings: page[:headings],
          content: page[:content],
          content_length: page[:content_length]
        }
      end
    end

    def conversation
      @context[:conversation] || {}
    end

    def project
      @context[:project]
    end

    def draft
      artifact = @tool_result[:artifact]
      return nil unless artifact

      {
        title: artifact[:title],
        bullets: artifact[:bullets],
        sources: artifact[:sources]
      }
    end

    def missing_context
      return [] if clarified?
      return [] if @user_message.split.length >= 8

      [ "tên sản phẩm", "loại khách hàng", "output mong muốn" ]
    end

    def clarified?
      @user_message.downcase.include?("bổ sung ngữ cảnh:") ||
        Array(@context[:recent_messages]).any? do |message|
          role = message[:role] || message["role"]
          content = message[:content] || message["content"]
          role == "user" && content.to_s.downcase.start_with?("bổ sung ngữ cảnh:")
        end
    end
  end
end
