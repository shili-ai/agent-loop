module AgentLoop
  class WebSearchNoteBuilder
    def initialize(results:)
      @results = results
    end

    def call
      lines = ["### Kết quả web"]
      if @results.empty?
        lines << "- Không tìm thấy kết quả web phù hợp."
      else
        @results.each do |result|
          url = result[:url].to_s.empty? ? "" : " — #{result[:url]}"
          lines << "- **#{result[:title]}**#{url}: #{result[:snippet]}"
        end
      end
      lines.join("\n")
    end
  end
end
