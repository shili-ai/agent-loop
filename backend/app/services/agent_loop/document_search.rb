module AgentLoop
  class DocumentSearch
    DEFAULT_LIMIT = 5

    # Trọng số ưu tiên nguồn khi rank chéo. ES (BM25) đáng tin nhất, rồi tới tài
    # liệu upload quét trực tiếp, cuối cùng là Google Drive live search.
    SOURCE_WEIGHTS = { elasticsearch: 1.0, uploaded: 0.9, drive: 0.85 }.freeze

    def initialize(query:, conversation:, limit: DEFAULT_LIMIT)
      @query = query.to_s
      @conversation = conversation
      @limit = limit
    end

    def call
      es_enabled = ElasticsearchDocumentStore.enabled?

      drive_thread = Thread.new { safe_group { DriveDocumentSearch.new(query: @query, limit: @limit).call } }
      es_thread = es_enabled ? Thread.new { safe_group { elasticsearch_documents } } : nil
      # Chỉ quét DB song song khi KHÔNG có ES (tránh trùng lặp vì ES đã index cùng
      # tập tài liệu). Khi có ES nhưng ES rỗng thì mới quét DB như fallback.
      uploaded_thread = es_enabled ? nil : Thread.new { safe_group { uploaded_documents } }

      es_docs = es_thread ? es_thread.value : []
      uploaded_docs = uploaded_thread ? uploaded_thread.value : []
      uploaded_docs = safe_group { uploaded_documents } if es_enabled && es_docs.empty?
      drive_docs = drive_thread.value

      rank(elasticsearch: es_docs, uploaded: uploaded_docs, drive: drive_docs).first(@limit)
    end

    private

    def safe_group
      yield
    rescue StandardError => e
      Rails.logger.warn("[AgentLoop::DocumentSearch] group failed: #{e.class}: #{e.message}")
      []
    end

    # Chuẩn hoá điểm theo từng nguồn (0..1 so với max trong nguồn), nhân trọng số
    # nguồn rồi sort chéo — thay vì nối phẳng theo thứ tự nguồn như trước.
    def rank(groups)
      items = groups.flat_map do |provider, group|
        weight = SOURCE_WEIGHTS[provider] || 0.8
        normalize_group(Array(group), weight)
      end
      dedupe_and_sort(items)
    end

    def normalize_group(group, weight)
      max = group.filter_map { |document| raw_score(document) }.max
      group.each_with_index.map do |document, index|
        base =
          if max && max > 0 && raw_score(document)
            raw_score(document).to_f / max
          else
            # Không có điểm số -> dùng thứ hạng vị trí (top cao hơn) làm proxy.
            1.0 - (index.to_f / [ group.size, 1 ].max) * 0.5
          end
        document.merge(_rank: (base * weight).round(5))
      end
    end

    def raw_score(document)
      document[:score] || document[:retrieval_score]
    end

    def dedupe_and_sort(items)
      by_key = {}
      items.each do |item|
        key = item[:source].presence || [ item[:title], item[:snippet] ]
        by_key[key] = item if by_key[key].nil? || item[:_rank] > by_key[key][:_rank]
      end
      by_key.values.sort_by { |item| -item[:_rank] }.map { |item| item.except(:_rank) }
    end

    def elasticsearch_documents
      ElasticsearchDocumentStore.new.search(query: @query, conversation: @conversation, limit: @limit)
    end

    def uploaded_documents
      documents = AgentDocument.for_conversation_scope(@conversation).where.not(content: [ nil, "" ])
      scored = documents.filter_map do |document|
        score = score_document(document)
        next if score <= 0

        [ score, serialize(document, retrieval_score: score) ]
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

    def serialize(document, retrieval_score: nil)
      {
        title: document.title,
        type: "uploaded_file",
        source: document.agent_conversation_id.present? ? "chat://documents/#{document.id}" : "project://documents/#{document.id}",
        snippet: snippet_for(document),
        filename: document.filename,
        document_id: document.id,
        search_provider: "uploaded",
        retrieval_score: retrieval_score
      }.compact
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
