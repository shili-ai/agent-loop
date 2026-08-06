module AgentLoop
  class DocumentSearchNoteBuilder
    def initialize(documents:)
      @documents = documents
    end

    def call
      lines = ["### Documents found"]
      @documents.each do |document|
        lines << "- **#{document[:title]}** (`#{document[:type]}`): #{document[:snippet]}"
      end
      lines.join("\n")
    end
  end
end
