module AgentLoop
  class DriveDocumentSearch
    def initialize(query:, limit: DocumentSearch::DEFAULT_LIMIT)
      @query = query.to_s
      @limit = limit
    end

    def call
      return [] unless AgentConnectorRegistry.google_drive_enabled?
      return [] unless GoogleDriveConnector.connected?

      GoogleDriveConnector.search_documents(query: @query, limit: @limit).map { |document| normalize_document(document) }
    rescue StandardError => e
      Rails.logger.warn("[AgentLoop::DriveDocumentSearch] live search failed: #{e.class}: #{e.message}")
      []
    end

    private

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
