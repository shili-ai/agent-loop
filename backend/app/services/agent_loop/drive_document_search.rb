require "json"

module AgentLoop
  class DriveDocumentSearch
    DEFAULT_INDEX_PATH = Rails.root.join("storage/google_drive_documents.json").to_s

    def initialize(query:, limit: DocumentSearch::DEFAULT_LIMIT, index_path: nil)
      @query = query.to_s
      @limit = limit
      @index_path = index_path.presence || AgentConnectorRegistry.google_drive_index_path
    end

    def call
      return [] unless AgentConnectorRegistry.google_drive_enabled?
      return [] unless File.exist?(@index_path)

      documents = JSON.parse(File.read(@index_path), symbolize_names: true)
      ranked_documents(documents).first(@limit)
    rescue JSON::ParserError
      []
    end

    private

    def ranked_documents(documents)
      Array(documents).filter_map do |document|
        normalized = normalize_document(document)
        score = score_document(normalized)
        next if score <= 0

        [ score, normalized ]
      end.sort_by { |score, document| [ -score, document[:title].to_s ] }.map(&:second)
    end

    def normalize_document(document)
      content = document[:content] || document[:text] || document[:snippet] || document[:summary]
      file_id = document[:file_id] || document[:id]
      url = document[:url] || document[:web_url] || drive_url(file_id)

      {
        title: document[:title] || document[:name] || document[:filename] || "Google Drive document",
        type: document[:type] || document[:mime_type] || "google_drive",
        source: file_id.present? ? "drive://files/#{file_id}" : "drive://documents",
        snippet: snippet_for(content.to_s),
        filename: document[:filename] || document[:name],
        document_id: file_id,
        url: url
      }.compact
    end

    def score_document(document)
      tokens = keywords
      return 1 if tokens.empty?

      haystack = "#{document[:title]} #{document[:filename]} #{document[:snippet]} #{document[:url]}".downcase
      tokens.sum { |token| haystack.scan(Regexp.escape(token)).count }
    end

    def snippet_for(content)
      text = content.to_s.squish
      return "" if text.blank?

      first_match = keywords.filter_map { |keyword| text.downcase.index(keyword) }.min
      return text.first(420) unless first_match

      start = [ first_match - 140, 0 ].max
      prefix = start.positive? ? "…" : ""
      suffix = start + 420 < text.length ? "…" : ""
      "#{prefix}#{text[start, 420]}#{suffix}"
    end

    def drive_url(file_id)
      return nil if file_id.blank?

      "https://drive.google.com/file/d/#{file_id}/view"
    end

    def keywords
      @keywords ||= @query.downcase.scan(/[\p{L}\p{N}]+/).select { |word| word.length >= 3 }.uniq
    end
  end
end
