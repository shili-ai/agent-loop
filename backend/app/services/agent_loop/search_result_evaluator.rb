module AgentLoop
  class SearchResultEvaluator
    MAX_OUTPUT_ITEMS = 8
    STOP_WORDS = %w[
      anh ban cac can cho cua duoc hay khi la lam mot nay neu nhu noi qua sau tao
      the thi tim toi trong tren va ve voi web gi gom lap bang thong tin
    ].freeze

    def initialize(query:, documents: [], web_results: [], web_pages: [])
      @query = query.to_s
      @documents = Array(documents)
      @web_results = Array(web_results)
      @web_pages = Array(web_pages)
    end

    def call
      document_evaluations = evaluate_documents
      web_result_evaluations = evaluate_web_results
      web_page_evaluations = evaluate_web_pages(web_result_evaluations)

      {
        documents: accepted_items(document_evaluations),
        web_results: accepted_items(web_result_evaluations),
        web_pages: accepted_items(web_page_evaluations),
        rejected_documents: rejected_items(document_evaluations),
        rejected_web_results: rejected_items(web_result_evaluations),
        rejected_web_pages: rejected_items(web_page_evaluations),
        document_evaluations: document_evaluations,
        web_result_evaluations: web_result_evaluations,
        web_page_evaluations: web_page_evaluations,
        output: output_for(document_evaluations, web_result_evaluations, web_page_evaluations)
      }
    end

    private

    def evaluate_documents
      @documents.map do |document|
        evaluate_item(
          document,
          type: "document",
          title: document[:title] || document["title"],
          url: document[:url] || document["url"] || document[:source] || document["source"],
          text: [
            document[:title] || document["title"],
            document[:filename] || document["filename"],
            document[:snippet] || document["snippet"],
            document[:source] || document["source"]
          ].compact.join(" "),
          prescored: retrieval_scored?(document)
        )
      end
    end

    # Tài liệu nội bộ do ES (BM25) hoặc quét DB xếp hạng đã mang sẵn điểm phù hợp;
    # giữ lại kể cả khi không khớp keyword thô để không vứt oan nguồn đúng ngữ nghĩa.
    def retrieval_scored?(document)
      score = document[:score] || document["score"] || document[:retrieval_score] || document["retrieval_score"]
      score.to_f.positive?
    end

    def evaluate_web_results
      @web_results.map do |result|
        evaluate_item(
          result,
          type: "web_result",
          title: result[:title] || result["title"],
          url: result[:url] || result["url"],
          text: [
            result[:title] || result["title"],
            result[:snippet] || result["snippet"],
            result[:url] || result["url"],
            result[:source] || result["source"]
          ].compact.join(" ")
        )
      end
    end

    def evaluate_web_pages(web_result_evaluations)
      accepted_urls = web_result_evaluations.select { |entry| entry[:accepted] }.map { |entry| normalized_url(entry[:url]) }.compact
      @web_pages.map do |page|
        url = page[:url] || page["url"]
        evaluation = evaluate_item(
          page,
          type: "web_page",
          title: page[:title] || page["title"],
          url: url,
          text: [
            page[:title] || page["title"],
            page[:description] || page["description"],
            Array(page[:headings] || page["headings"]).join(" "),
            page[:content] || page["content"],
            url
          ].compact.join(" ")
        )
        next evaluation if evaluation[:accepted]

        if accepted_urls.include?(normalized_url(url)) && (page[:content] || page["content"]).to_s.present?
          evaluation.merge(
            accepted: true,
            reason: "Trang thuộc link web đã đạt chuẩn và đọc được nội dung.",
            matched_keywords: evaluation[:matched_keywords],
            score: [ evaluation[:score], 1 ].max
          )
        else
          evaluation
        end
      end
    end

    def evaluate_item(item, type:, title:, url:, text:, prescored: false)
      score, matched_keywords = score_text(title: title, url: url, text: text)
      accepted = query_keywords.empty? || score.positive? || prescored
      {
        type: type,
        title: title.to_s.presence || url.to_s.presence || "Không có tiêu đề",
        url: url,
        score: score,
        accepted: accepted,
        matched_keywords: matched_keywords,
        reason: reason_for(accepted, matched_keywords, score, prescored: prescored),
        item: item
      }
    end

    def score_text(title:, url:, text:)
      normalized_title = normalize(title)
      normalized_url = normalize(url)
      normalized_text = normalize(text)

      matched = []
      score = 0
      query_keywords.each do |keyword|
        keyword_score = 0
        keyword_score += 4 if normalized_title.include?(keyword)
        keyword_score += 3 if normalized_url.include?(keyword)
        keyword_score += 1 if normalized_text.include?(keyword)
        next unless keyword_score.positive?

        matched << keyword
        score += keyword_score
      end
      if normalized_text.include?(normalize(@query)) && normalize(@query).length >= 8
        score += 5
      end
      [ score, matched.uniq ]
    end

    def accepted_items(evaluations)
      evaluations.select { |entry| entry[:accepted] }.map { |entry| annotate(entry) }
    end

    def rejected_items(evaluations)
      evaluations.reject { |entry| entry[:accepted] }.map { |entry| entry.except(:item) }
    end

    def annotate(entry)
      entry[:item].merge(
        evaluation: entry.except(:item)
      )
    end

    def output_for(document_evaluations, web_result_evaluations, web_page_evaluations)
      [
        "### Đánh giá nguồn tìm được",
        "- Tài liệu đạt chuẩn: #{accepted_count(document_evaluations)}/#{document_evaluations.count}",
        "- Link web đạt chuẩn: #{accepted_count(web_result_evaluations)}/#{web_result_evaluations.count}",
        "- Trang đã đọc đạt chuẩn: #{accepted_count(web_page_evaluations)}/#{web_page_evaluations.count}",
        "",
        section("Tài liệu đạt chuẩn", document_evaluations.select { |entry| entry[:accepted] }),
        section("Link web đạt chuẩn", web_result_evaluations.select { |entry| entry[:accepted] }),
        section("Trang đã đọc đạt chuẩn", web_page_evaluations.select { |entry| entry[:accepted] })
      ].reject(&:blank?).join("\n")
    end

    def section(title, entries)
      return nil if entries.blank?

      lines = [ "#### #{title}" ]
      entries.first(MAX_OUTPUT_ITEMS).each do |entry|
        line = "- #{entry[:title]} — điểm #{entry[:score]}; #{entry[:reason]}"
        line += " (#{entry[:url]})" if entry[:url].present?
        lines << line
      end
      lines << "- … còn #{entries.count - MAX_OUTPUT_ITEMS} mục" if entries.count > MAX_OUTPUT_ITEMS
      lines.join("\n")
    end

    def accepted_count(evaluations)
      evaluations.count { |entry| entry[:accepted] }
    end

    def reason_for(accepted, matched_keywords, score, prescored: false)
      if accepted
        return "Không có từ khoá đủ rõ trong yêu cầu nên giữ lại để model cân nhắc." if query_keywords.empty?
        return "Khớp từ khoá #{matched_keywords.first(5).join(', ')} với yêu cầu." if score.positive?

        "Không khớp keyword thô nhưng đã được nguồn nội bộ xếp hạng phù hợp nên giữ lại."
      else
        "Chưa thấy khớp từ khoá chính của yêu cầu trong title/snippet/nội dung đọc được."
      end
    end

    def query_keywords
      @query_keywords ||= normalize(@query)
        .scan(/[a-z0-9]+/)
        .select { |word| word.length >= 3 && !STOP_WORDS.include?(word) }
        .uniq
        .first(12)
    end

    def normalized_url(value)
      value.to_s.downcase.sub(%r{\Ahttps?://}, "").sub(%r{/\z}, "")
    end

    def normalize(value)
      value.to_s.downcase.unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").gsub("đ", "d")
    end
  end
end
