module AgentLoop
  class WebPageReadNoteBuilder
    def initialize(pages:)
      @pages = Array(pages)
    end

    def call
      lines = [ "### Nội dung trang đã đọc" ]
      if @pages.empty?
        lines << "- Chưa đọc được nội dung trang nào."
      else
        @pages.each do |page|
          url = page[:url].to_s.empty? ? "" : " — #{page[:url]}"
          status = page[:status] == "read" ? "#{page[:content_length]} ký tự" : "lỗi: #{page[:error]}"
          lines << "- **#{page[:title]}**#{url}: #{status}"
          next unless page[:status] == "read" && page[:content].present?

          lines << ""
          lines << "```text"
          lines << truncate(page[:content], 1_500)
          lines << "```"
        end
      end
      lines.join("\n")
    end

    private

    def truncate(text, length)
      text = text.to_s
      text.length > length ? "#{text[0...(length - 1)]}…" : text
    end
  end
end
