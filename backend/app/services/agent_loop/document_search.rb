module AgentLoop
  class DocumentSearch
    DEFAULT_LIMIT = 5

    def initialize(query:, conversation:, limit: DEFAULT_LIMIT)
      @query = query.to_s
      @conversation = conversation
      @limit = limit
    end

    def call
      uploaded_thread = Thread.new { uploaded_documents }
      elasticsearch_thread = Thread.new { elasticsearch_documents }
      drive_thread = Thread.new { DriveDocumentSearch.new(query: @query, limit: @limit).call }

      merge_results(uploaded_thread.value, elasticsearch_thread.value, drive_thread.value).first(@limit)
    end

    private

    def merge_results(*groups)
      groups.flatten.compact.uniq { |document| document[:source].presence || [ document[:title], document[:snippet] ] }
    end

    def elasticsearch_documents
      ElasticsearchDocumentStore.new.search(query: @query, conversation: @conversation, limit: @limit)
    end

    def uploaded_documents
      documents = AgentDocument.for_conversation_scope(@conversation).where.not(content: [ nil, "" ])
      scored = documents.filter_map do |document|
        score = score_document(document)
        next if score <= 0

        [ score, serialize(document) ]
      end
      ranked = scored.sort_by { |score, _document| -score }.first(@limit).map(&:second)
      return ranked if ranked.any?

      documents.order(created_at: :desc).limit(@limit).map { |document| serialize(document) }
    end

    def score_document(document)
      tokens = keywords
      return 1 if tokens.empty?

      haystack = "#{document.title} #{document.filename} #{document.content}".downcase
      tokens.sum { |token| haystack.scan(token).count }
    end

    def serialize(document)
      {
        title: document.title,
        type: "uploaded_file",
        source: document.agent_conversation_id.present? ? "chat://documents/#{document.id}" : "project://documents/#{document.id}",
        snippet: snippet_for(document),
        filename: document.filename,
        document_id: document.id
      }
    end

    def snippet_for(document)
      content = document.content.to_s.squish
      return document.summary if content.blank?

      first_match = keywords.filter_map { |keyword| content.downcase.index(keyword) }.min
      return content.first(360) unless first_match

      start = [ first_match - 120, 0 ].max
      prefix = start.positive? ? "…" : ""
      suffix = start + 360 < content.length ? "…" : ""
      "#{prefix}#{content[start, 360]}#{suffix}"
    end

    def keywords
      @keywords ||= @query.downcase.scan(/[\p{L}\p{N}]+/).select { |word| word.length >= 3 }.uniq
    end
  end
end
