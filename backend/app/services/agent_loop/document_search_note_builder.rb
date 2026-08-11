module AgentLoop
  class DocumentSearchNoteBuilder
    def initialize(documents:)
      @documents = documents
    end

    def call
      lines = [ "### Tài liệu tìm thấy" ]
      @documents.each do |document|
        source = document[:url].presence || document[:source]
        suffix = source.present? ? " — #{source}" : ""
        lines << "- **#{document[:title]}** (`#{document[:type]}`)#{suffix}: #{document[:snippet]}"
      end
      lines.join("\n")
    end
  end
end
