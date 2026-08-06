module AgentLoop
  class DocumentSearchNoteBuilder
    def initialize(documents:)
      @documents = documents
    end

    def call
      lines = ["### Tài liệu tìm thấy"]
      @documents.each do |document|
        lines << "- **#{document[:title]}** (`#{document[:type]}`): #{document[:snippet]}"
      end
      lines.join("\n")
    end
  end
end
