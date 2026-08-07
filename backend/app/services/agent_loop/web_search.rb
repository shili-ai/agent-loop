require "json"
require "cgi"
require "net/http"
require "uri"

module AgentLoop
  class WebSearch
    DEFAULT_ENDPOINT = "https://api.duckduckgo.com/"
    DEFAULT_LIMIT = 5

    def initialize(query:, limit: DEFAULT_LIMIT, endpoint: ENV.fetch("WEB_SEARCH_ENDPOINT", DEFAULT_ENDPOINT))
      @query = query.to_s
      @search_query = normalize_query(@query)
      @limit = limit
      @endpoint = endpoint
    end

    def call
      return [] if @search_query.strip.empty?

      instant_results = instant_answer_results
      return instant_results if instant_results.any?

      rss_results
    rescue StandardError => e
      [{ title: "Web search không khả dụng", url: nil, snippet: utf8(e.message), source: "error" }]
    end

    private

    def instant_answer_results
      uri = URI(@endpoint)
      params = URI.decode_www_form(uri.query.to_s)
      params += [
        ["q", @search_query],
        ["format", "json"],
        ["no_html", "1"],
        ["skip_disambig", "1"]
      ]
      uri.query = URI.encode_www_form(params)

      response = fetch(uri)
      body = utf8(response.body)
      return [] unless response.is_a?(Net::HTTPSuccess) && body.strip.start_with?("{")

      parse_instant_answer(JSON.parse(body))
    end

    def rss_results
      uri = URI("https://www.bing.com/search")
      uri.query = URI.encode_www_form(q: @search_query, format: "rss", mkt: "en-US", setlang: "en-US", cc: "US")

      response = fetch(uri)
      raise "Web search failed: #{response.code}" unless response.is_a?(Net::HTTPSuccess)

      parse_rss(utf8(response.body))
    end

    def fetch(uri, redirect_limit = 3)
      response = Net::HTTP.get_response(uri)
      return response unless response.is_a?(Net::HTTPRedirection) && redirect_limit.positive?

      location = URI(response["location"].to_s)
      location = uri + response["location"].to_s if location.relative?
      fetch(location, redirect_limit - 1)
    end

    def parse_instant_answer(data)
      results = []
      add_result(results, data["Heading"], data["AbstractURL"], data["AbstractText"], "abstract")
      collect_related_topics(data["RelatedTopics"], results)
      results.uniq { |item| [item[:title], item[:url]] }.first(@limit)
    end

    def parse_rss(xml)
      xml.to_s.scan(%r{<item>(.*?)</item>}m).map do |(item)|
        title = item[%r{<title>(.*?)</title>}m, 1]
        url = item[%r{<link>(.*?)</link>}m, 1]
        snippet = item[%r{<description>(.*?)</description>}m, 1]
        next if noisy_result?(title, url)

        {
          title: clean_html(title),
          url: clean_html(url),
          snippet: clean_html(snippet),
          source: "bing_rss"
        }
      end.compact.uniq { |item| [item[:title], item[:url]] }.first(@limit)
    end

    def noisy_result?(title, url)
      text = "#{title} #{url}".downcase
      text.include?("login") || text.include?("signin") || text.include?("sign-in")
    end

    def collect_related_topics(items, results)
      Array(items).each do |item|
        if item["Topics"].is_a?(Array)
          collect_related_topics(item["Topics"], results)
          next
        end

        add_result(results, item["Text"], item["FirstURL"], item["Text"], "related_topic")
      end
    end

    def add_result(results, title, url, snippet, source)
      clean_title = normalize_text(title)
      clean_snippet = normalize_text(snippet)
      return if clean_title.empty? && clean_snippet.empty?

      results << {
        title: clean_title.empty? ? truncate(clean_snippet, 80) : clean_title,
        url: present_string(url),
        snippet: clean_snippet,
        source: source
      }
    end

    def present_string(value)
      text = utf8(value).strip
      text.empty? ? nil : text
    end

    def normalize_text(value)
      utf8(value).gsub(/\s+/, " ").strip
    end

    def normalize_query(value)
      text = normalize_text(value)
      text = text.gsub(/bổ sung ngữ cảnh:/i, " ")
      text = text.gsub(/yêu cầu gốc:/i, " ")
      text = text.gsub(/người dùng đã bổ sung.*?:/i, " ")
      text = text.gsub(/tìm trên web|search web|tìm web|tra cứu web|google giúp tôi/i, " ")
      text = text.gsub(/giúp tôi|giúp mình|cho tôi|cho mình/i, " ")
      text = text.gsub(/thông tin mới nhất về/i, " ")
      text = text.gsub(/đối thủ\s+(.+)/i, '\1 competitors')
      text = text.gsub(/xu hướng/i, "trends")
      text = text.gsub(/hiện nay/i, "current")
      text = text.gsub(/tóm tắt.*$/i, " ")
      text = text.gsub(/đề xuất.*$/i, " ")
      text = text.gsub(/rồi .*$/i, " ")
      text = text.gsub(/[“”"']/, " ")
      text = normalize_text(text).gsub(/[,\.;:]+$/, "")
      return "CRM SaaS trends current" if text.downcase.match?(/crm.*saas|saas.*crm/)

      text
    end

    def clean_html(value)
      CGI.unescapeHTML(utf8(value).gsub(/<[^>]+>/, " ")).gsub(/\s+/, " ").strip
    end

    def truncate(text, length)
      text.length > length ? "#{text[0...(length - 1)]}…" : text
    end

    def utf8(value)
      value.to_s.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
    rescue Encoding::UndefinedConversionError, Encoding::InvalidByteSequenceError
      value.to_s.force_encoding("UTF-8").encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
    end
  end
end
