require "json"

module AgentLoop
  # Review bằng model độc lập với writer; không tự gắn nhãn passed theo rule/template.
  class ModelArtifactVerifier
    def initialize(artifact:, message:, documents:, client: LocalModelClient.new)
      @artifact = artifact || {}
      @message = message.to_s
      @documents = Array(documents)
      @client = client
    end

    attr_reader :client

    def call_with_metrics
      result = @client.chat_with_metrics(messages: messages, temperature: 0, format: "json")
      parsed = JSON.parse(extract_json(result[:content]))
      status = parsed["status"].to_s
      checks = Array(parsed["checks"]).filter_map do |check|
        next unless check.is_a?(Hash) && check["label"].to_s.present?

        { label: check["label"].to_s, passed: check["passed"] == true, message: check["message"].to_s }
      end
      raise "Model review trả về dữ liệu không hợp lệ" unless %w[verified needs_revision].include?(status) && checks.any?

      {
        status: status,
        checks: checks,
        summary: parsed["summary"].to_s.presence || "Model đã review bản nháp.",
        output: result[:content],
        metrics: result[:metrics],
        prompt_messages: messages,
        raw: result[:content]
      }
    end

    private

    def messages
      [
        { role: "system", content: "Review deliverable thật chặt. Chỉ xác nhận claim được chứng minh bởi evidence. Trả JSON {status: verified|needs_revision, summary: string, checks: [{label, passed, message}]}. Không bịa check hay nguồn." },
        { role: "user", content: JSON.pretty_generate(request: @message, artifact: @artifact.slice(:title, :content), evidence: @documents.map { |doc| doc.slice(:title, :snippet, :source, :url) }) }
      ]
    end

    def extract_json(content)
      text = content.to_s.strip
      return text if text.start_with?("{")

      start = text.index("{")
      finish = text.rindex("}")
      raise "Model review không trả JSON" unless start && finish && finish > start

      text[start..finish]
    end
  end
end
