module AgentLoop
  class WebSearchNoteBuilder
    def initialize(results:, candidates: [], raw_results: [])
      @results = results
      @raw_results = raw_results
    end

    def call
      lines = [ "### Kết quả web" ]
      if @raw_results.any?
        lines << ""
        lines << "### Link tìm được"
        @raw_results.first(8).each do |result|
          url = result[:url].to_s.empty? ? "" : " — #{result[:url]}"
          lines << "- **#{result[:title]}**#{url}: #{result[:snippet]}"
        end
        lines << ""
        lines << "### Sau khi lọc"
      end
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
