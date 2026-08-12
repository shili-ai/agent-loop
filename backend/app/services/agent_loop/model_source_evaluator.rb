require "json"

module AgentLoop
  # Mỗi nguồn có một lượt reasoning độc lập. Không dùng keyword/rank để quyết
  # định PASS/FAIL; các rule web chỉ còn là lớp an toàn/kỹ thuật trước đó.
  class ModelSourceEvaluator
    def initialize(query:, documents: [], web_results: [], web_pages: [], shared_state: {}, client: LocalModelClient.new)
      @query = query.to_s
      @groups = { documents: Array(documents), web_results: Array(web_results), web_pages: Array(web_pages) }
      @shared_state = shared_state
      @client = client
    end

    def call
      evaluated = @groups.transform_values { |items| evaluate_parallel(items) }
      {
        documents: accepted(evaluated[:documents]),
        web_results: accepted(evaluated[:web_results]),
        web_pages: accepted(evaluated[:web_pages]),
        rejected_documents: rejected(evaluated[:documents]),
        rejected_web_results: rejected(evaluated[:web_results]),
        rejected_web_pages: rejected(evaluated[:web_pages]),
        document_evaluations: evaluated[:documents],
        web_result_evaluations: evaluated[:web_results],
        web_page_evaluations: evaluated[:web_pages],
        output: output(evaluated)
      }
    end

    private

    def evaluate_parallel(items)
      items.map { |item| Thread.new { evaluate(item) } }.map(&:value)
    end

    def evaluate(item)
      result = @client.chat_with_metrics(messages: messages(item), temperature: 0, format: "json")
      parsed = JSON.parse(extract_json(result[:content]))
      passed = parsed["pass"] == true && parsed["should_read"] == true
      {
        type: source_type(item), title: title(item), url: url(item), accepted: passed,
        relevance: parsed["relevance"], credibility: parsed["credibility"], usefulness: parsed["usefulness"],
        should_read: parsed["should_read"] == true, reason: parsed["reason"].to_s, metrics: result[:metrics], item: item
      }
    rescue StandardError => e
      { type: source_type(item), title: title(item), url: url(item), accepted: false, should_read: false, reason: "Model không đánh giá được nguồn: #{e.message}", error: e.message, item: item }
    end

    def messages(item)
      [
        { role: "system", content: "Bạn là source evaluator. Chỉ đánh giá MỘT nguồn. Trả JSON {pass:boolean,relevance:0..1,credibility:0..1,usefulness:0..1,should_read:boolean,reason:string}. pass/should_read chỉ true khi nguồn phù hợp mục tiêu, đủ đáng tin và đáng đọc tiếp. Không suy diễn ngoài nguồn." },
        { role: "user", content: JSON.generate(goal: @shared_state[:objective] || @shared_state["objective"], request: @query, source: source_payload(item)) }
      ]
    end

    def source_payload(item)
      item.slice(:title, :url, :source, :snippet, :filename, :type, :description, :headings).merge(content: item[:content].to_s.first(8_000))
    end

    def source_type(item) = item[:type].to_s.presence || "source"
    def title(item) = item[:title].to_s.presence || url(item) || "Không có tiêu đề"
    def url(item) = item[:url] || item[:source]
    def extract_json(content)
      text = content.to_s.strip
      return text if text.start_with?("{")
      first, last = text.index("{"), text.rindex("}")
      raise "Model không trả JSON" unless first && last && last > first

      text[first..last]
    end
    def accepted(entries) = entries.select { |entry| entry[:accepted] }.map { |entry| entry[:item].merge(evaluation: entry.except(:item)) }
    def rejected(entries) = entries.reject { |entry| entry[:accepted] }.map { |entry| entry.except(:item) }
    def output(evaluated)
      evaluated.map { |kind, entries| "- #{kind}: #{entries.count { |entry| entry[:accepted] }}/#{entries.count} nguồn PASS bởi model." }.unshift("### Model đánh giá nguồn").join("\n")
    end
  end
end
