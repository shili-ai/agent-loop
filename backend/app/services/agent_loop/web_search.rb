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
      @candidates = []
      @raw_results = []
    end

    attr_reader :candidates, :raw_results

    def call
      @candidates = []
      @raw_results = []
      return [] if @search_query.strip.empty?

      direct_results = direct_domain_results
      instant_results = instant_answer_results
      rss_results = rss_results()
      ranked_results(direct_results + instant_results + rss_results).first(@limit)
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

    def direct_domain_results
      domain = extracted_domain
      return [] unless domain

      [ "https://#{domain}", "http://#{domain}" ].each do |url|
        uri = URI(url)
        response = fetch(uri)
        next unless response.is_a?(Net::HTTPSuccess)

        body = utf8(response.body)
        title = page_title(body).presence || domain
        snippet = page_description(body).presence || "Trang được truy cập trực tiếp từ domain người dùng cung cấp."
        results = []
        add_result(results, title, response.uri.to_s, snippet, "direct_domain")
        return results if results.any?
      rescue StandardError => e
        record_candidate(domain, url, e.message, "Không truy cập trực tiếp được domain")
      end

      []
    end

    def rss_results
      results = fetch_rss_results(safe_search_query)
      return results if results.any?
      return results if broad_search_query == safe_search_query

      fetch_rss_results(broad_search_query)
    end

    def fetch_rss_results(query)
      uri = URI("https://www.bing.com/search")
      uri.query = URI.encode_www_form(
        q: query,
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
      response.define_singleton_method(:uri) { uri }
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
        record_raw_result(clean_title, clean_url, clean_snippet, "bing_rss")
        reason = rejection_reason(clean_title, clean_url, clean_snippet)
        if reason
          record_candidate(clean_title, clean_url, clean_snippet, reason)
          next
        end

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
      rejection_reason(title, url, snippet).present?
    end

    def rejection_reason(title, url, snippet = nil)
      return "Tiêu đề rỗng/không đọc được" if title.to_s.gsub(/[-–—\s]/, "").blank?

      text = "#{title} #{url} #{snippet}".downcase
      return "Trang đăng nhập/không có nội dung công khai" if text.include?("login") || text.include?("signin") || text.include?("sign-in")
      return "Dính từ khoá/domain bị chặn" if BLOCKED_TEXT_TERMS.any? { |term| text.include?(term) }

      host = host_for(url)
      return "Domain bị chặn hoặc nguồn kém phù hợp" if BLOCKED_DOMAIN_PARTS.any? { |part| host.include?(part) }
      return "Không đủ khớp với #{@search_query}" unless relevant_result?(title, url, snippet)

      nil
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
      clean_url = present_string(url)
      record_raw_result(clean_title, clean_url, clean_snippet, source)
      return if clean_title.empty? && clean_snippet.empty?
      reason = rejection_reason(clean_title, clean_url, clean_snippet)
      if reason
        record_candidate(clean_title, clean_url, clean_snippet, reason)
        return
      end

      results << {
        title: clean_title.empty? ? truncate(clean_snippet, 80) : clean_title,
        url: clean_url,
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
      text = text.gsub(/các thông tin về|thông tin về|tìm thông tin về/i, " ")
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

    def broad_search_query
      broad = @search_query.sub(/\A([a-z0-9-]+)\.[a-z]{2,}\z/i, '\1')
      ([ broad ] + SEARCH_EXCLUSIONS).join(" ")
    end

    def extracted_domain
      @search_query.downcase[%r{\b(?:https?://)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,})(?:/[^\s]*)?\b}, 1]
    end

    def page_title(body)
      clean_html(body[%r{<title[^>]*>(.*?)</title>}mi, 1])
    end

    def page_description(body)
      body[%r{<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>}mi, 1].then { |text| clean_html(text) }
    end

    def ranked_results(results)
      items = results.uniq { |item| [ item[:title], item[:url] ] }.sort_by { |item| result_rank(item) }
      trusted = items.select { |item| trusted_source?(item[:url]) }
      trusted.any? ? trusted : items
    end

    def record_candidate(title, url, snippet, reason)
      clean_title = normalize_text(title)
      clean_url = present_string(url)
      return if clean_title.blank? && clean_url.blank?
      return if reason.to_s == "Tiêu đề rỗng/không đọc được" && !candidate_like_query?(clean_title, clean_url, snippet)

      @candidates << {
        title: clean_title.presence || clean_url,
        url: clean_url,
        snippet: truncate(normalize_text(snippet), 180),
        reason: reason
      }
      @candidates = @candidates.uniq { |item| [ item[:title], item[:url], item[:reason] ] }.first(8)
    end

    def record_raw_result(title, url, snippet, source)
      clean_title = normalize_text(title)
      clean_url = present_string(url)
      return if clean_title.blank? && clean_url.blank?

      @raw_results << {
        title: clean_title.presence || clean_url,
        url: clean_url,
        snippet: truncate(normalize_text(snippet), 180),
        source: source
      }
      @raw_results = @raw_results.uniq { |item| [ item[:title], item[:url] ] }.first(12)
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

    def candidate_like_query?(title, url, snippet)
      query_terms = @search_query.downcase.scan(/[\p{L}\p{N}]+/).select { |word| word.length >= 4 }
      return false if query_terms.empty?

      words = "#{title} #{url} #{snippet}".downcase.scan(/[\p{L}\p{N}]+/).select { |word| word.length >= 4 }
      query_terms.any? do |term|
        words.any? { |word| word.include?(term) || edit_distance(word, term) <= 2 }
      end
    end

    def edit_distance(left, right)
      return right.length if left.empty?
      return left.length if right.empty?

      previous = (0..right.length).to_a
      left.chars.each_with_index do |left_char, left_index|
        current = [ left_index + 1 ]
        right.chars.each_with_index do |right_char, right_index|
          cost = left_char == right_char ? 0 : 1
          current << [
            current[right_index] + 1,
            previous[right_index + 1] + 1,
            previous[right_index] + cost
          ].min
        end
        previous = current
      end
      previous.last
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
