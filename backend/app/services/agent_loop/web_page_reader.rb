require "cgi"
require "net/http"
require "nokogiri"
require "uri"

module AgentLoop
  class WebPageReader
    DEFAULT_LIMIT = 3
    MAX_TEXT_LENGTH = 6_000

    def initialize(results:, limit: DEFAULT_LIMIT)
      @results = Array(results)
      @limit = limit
    end

    def call
      @results.first(@limit).filter_map { |result| read_page(result) }
    end

    private

    def read_page(result)
      url = result[:url].to_s
      return nil if url.blank?

      response = fetch(URI(url))
      unless response.is_a?(Net::HTTPSuccess)
        return failure(result, "HTTP #{response.code}")
      end

      content_type = response["content-type"].to_s
      unless content_type.blank? || content_type.include?("text/html")
        return failure(result, "Không phải trang HTML")
      end

      document = Nokogiri::HTML(utf8(response.body))
      document.css("script, style, noscript, svg, nav, footer, header, form, iframe").remove

      title = clean_text(document.at_css("title")&.text).presence || result[:title]
      description = meta_description(document).presence || result[:snippet]
      headings = document.css("h1, h2").map { |node| clean_text(node.text) }.reject(&:blank?).first(8)
      body = extract_body_text(document)

      {
        title: title,
        url: response.uri.to_s,
        description: description,
        headings: headings,
        content: body,
        content_length: body.length,
        status: "read"
      }
    rescue StandardError => e
      failure(result, e.message)
    end

    def fetch(uri, redirect_limit = 3)
      request = Net::HTTP::Get.new(uri)
      request["User-Agent"] = "AgentLoop/1.0 (+https://local.agent-loop)"
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 5, read_timeout: 8) do |http|
        http.request(request)
      end
      response.define_singleton_method(:uri) { uri }
      return response unless response.is_a?(Net::HTTPRedirection) && redirect_limit.positive?

      location = URI(response["location"].to_s)
      location = uri + response["location"].to_s if location.relative?
      fetch(location, redirect_limit - 1)
    end

    def meta_description(document)
      document.at_css('meta[name="description"]')&.[]("content") ||
        document.at_css('meta[property="og:description"]')&.[]("content")
    end

    def extract_body_text(document)
      nodes = document.css("main p, article p, [role='main'] p")
      nodes = document.css("p, li") if nodes.empty?
      text = nodes.map { |node| clean_text(node.text) }.reject { |line| line.length < 30 }.uniq.join("\n")
      truncate(text.presence || clean_text(document.at_css("body")&.text), MAX_TEXT_LENGTH)
    end

    def failure(result, reason)
      {
        title: result[:title],
        url: result[:url],
        description: result[:snippet],
        headings: [],
        content: "",
        content_length: 0,
        status: "failed",
        error: truncate(clean_text(reason), 180)
      }
    end

    def clean_text(value)
      CGI.unescapeHTML(utf8(value)).gsub(/\s+/, " ").strip
    end

    def truncate(text, length)
      text = text.to_s
      text.length > length ? "#{text[0...(length - 1)]}…" : text
    end

    def utf8(value)
      value.to_s.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
    rescue Encoding::UndefinedConversionError, Encoding::InvalidByteSequenceError
      value.to_s.force_encoding("UTF-8").encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
    end
  end
end
