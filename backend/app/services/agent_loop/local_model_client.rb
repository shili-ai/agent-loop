require "json"
require "net/http"
require "uri"

module AgentLoop
  class LocalModelClient
    DEFAULT_BASE_URL = "http://localhost:11434"
    DEFAULT_MODEL = "llama3.2:3b"
    DEFAULT_OPEN_TIMEOUT = 5
    DEFAULT_READ_TIMEOUT = 30

    def initialize(
      base_url: ENV.fetch("OLLAMA_BASE_URL", DEFAULT_BASE_URL),
      model: ENV.fetch("OLLAMA_MODEL", DEFAULT_MODEL)
    )
      @base_url = base_url
      @model = model
    end

    attr_reader :model

    def chat(messages:, temperature: 0.2)
      uri = URI.join(@base_url, "/api/chat")
      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request.body = {
        model: @model,
        messages: messages,
        stream: false,
        options: {
          temperature: temperature
        }
      }.to_json

      http = Net::HTTP.new(uri.hostname, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = ENV.fetch("OLLAMA_OPEN_TIMEOUT", DEFAULT_OPEN_TIMEOUT).to_i
      http.read_timeout = ENV.fetch("OLLAMA_READ_TIMEOUT", DEFAULT_READ_TIMEOUT).to_i
      response = http.request(request)

      raise "Ollama request failed: #{response.code} #{response.body}" unless response.is_a?(Net::HTTPSuccess)

      JSON.parse(response.body).dig("message", "content").to_s.strip
    end
  end
end
