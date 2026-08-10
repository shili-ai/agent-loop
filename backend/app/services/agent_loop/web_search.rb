require "json"
require "cgi"
require "net/http"
require "uri"

module AgentLoop
  class WebSearch
    DEFAULT_ENDPOINT = "https://api.duckduckgo.com/"
    DEFAULT_LIMIT = 5
    BLOCKED_DOMAIN_PARTS = %w[
      xvideos
      xnxx
      xhamster
      pornhub
      redtube
      youporn
      spankbang
      rule34
      onlyfans
      fansly
      fandom.com
      ptt.cc
      reddit.com
      quora.com
      pinterest.com
      literotica
      nhentai
      hentai
    ].freeze
    BLOCKED_TEXT_TERMS = [
      "porn",
      "porno",
      "sex",
      "xxx",
      "adult video",
      "/forum/",
      "/threads/",
      "discussion forum",
      "forums",
      "bulletin board",
      "nude",
      "nsfw",
      "hentai",
      "rule 34",
      "rule34",
      "onlyfans",
      "xvideos",
      "xnxx"
    ].freeze
    TRUSTED_DOMAIN_PARTS = %w[
      wikipedia.org
      wiktionary.org
      britannica.com
      youtube.com
      linkedin.com
      instagram.com
      github.com
      microsoft.com
      google.com
      apple.com
      amazon.com
      cloudflare.com
      salesforce.com
      hubspot.com
      oracle.com
      ibm.com
      .gov
      .edu
    ].freeze
    SEARCH_EXCLUSIONS = %w[
      -porn
      -porno
      -sex
      -xxx
      -nsfw
      -hentai
      -rule34
      -xvideos
      -xnxx
      -pornhub
      -onlyfans
    ].freeze

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
      [ { title: "Web search không khả dụng", url: nil, snippet: utf8(e.message), source: "error" } ]
    end

    private

    def instant_answer_results
      uri = URI(@endpoint)
      params = URI.decode_www_form(uri.query.to_s)
      params += [
        [ "q", safe_search_query ],
        [ "format", "json" ],
        [ "no_html", "1" ],
        [ "skip_disambig", "1" ]
      ]
      uri.query = URI.encode_www_form(params)

      response = fetch(uri)
      body = utf8(response.body)
      return [] unless response.is_a?(Net::HTTPSuccess) && body.strip.start_with?("{")

      parse_instant_answer(JSON.parse(body))
    end

    def rss_results
      uri = URI("https://www.bing.com/search")
      uri.query = URI.encode_www_form(
        q: safe_search_query,
        format: "rss",
        mkt: "en-US",
        setlang: "en-US",
        cc: "US",
        safeSearch: "Strict"
      )

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
      ranked_results(results).first(@limit)
    end

    def parse_rss(xml)
      xml.to_s.scan(%r{<item>(.*?)</item>}m).map do |(item)|
        title = item[%r{<title>(.*?)</title>}m, 1]
        url = item[%r{<link>(.*?)</link>}m, 1]
        snippet = item[%r{<description>(.*?)</description>}m, 1]
        clean_title = clean_html(title)
        clean_url = clean_html(url)
        clean_snippet = clean_html(snippet)
        next if noisy_result?(clean_title, clean_url, clean_snippet)
        next unless relevant_result?(clean_title, clean_url, clean_snippet)

        {
          title: clean_title,
          url: clean_url,
          snippet: clean_snippet,
          source: "bing_rss"
        }
      end.compact
        .uniq { |item| [ item[:title], item[:url] ] }
        .sort_by { |item| result_rank(item) }
        .first(@limit)
    end

    def noisy_result?(title, url, snippet = nil)
      return true if title.to_s.gsub(/[-–—\s]/, "").blank?

      text = "#{title} #{url} #{snippet}".downcase
      return true if text.include?("login") || text.include?("signin") || text.include?("sign-in")
      return true if BLOCKED_TEXT_TERMS.any? { |term| text.include?(term) }

      host = host_for(url)
      BLOCKED_DOMAIN_PARTS.any? { |part| host.include?(part) }
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
      return if noisy_result?(clean_title, present_string(url), clean_snippet)
      return unless relevant_result?(clean_title, present_string(url), clean_snippet)

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
      text = text.gsub(/từ khoá|từ khóa|keyword/i, " ")
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

    def safe_search_query
      base = @search_query.split.one? ? %("#{@search_query}") : @search_query
      ([ base ] + SEARCH_EXCLUSIONS).join(" ")
    end

    def ranked_results(results)
      items = results.uniq { |item| [ item[:title], item[:url] ] }.sort_by { |item| result_rank(item) }
      trusted = items.select { |item| trusted_source?(item[:url]) }
      trusted.any? ? trusted : items
    end

    def result_rank(item)
      trusted_source?(item[:url]) ? 0 : 1
    end

    def trusted_source?(url)
      host = host_for(url)
      TRUSTED_DOMAIN_PARTS.any? { |part| host.include?(part) }
    end

    def relevant_result?(title, url, snippet)
      tokens = @search_query.downcase.scan(/[\p{L}\p{N}]+/).select { |word| word.length >= 3 }
      return true if tokens.empty?

      text = "#{title} #{url} #{snippet}".downcase
      return text.include?(tokens.first) if tokens.one?
      return false unless text.include?(tokens.first)
      return true if tokens[1..].any? { |token| text.include?(token) }

      matched_count = tokens.count { |token| text.include?(token) }
      matched_count >= (tokens.length * 0.6).ceil
    end

    def host_for(url)
      URI(url.to_s).host.to_s.downcase.sub(/\Awww\./, "")
    rescue URI::InvalidURIError
      url.to_s.downcase
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
