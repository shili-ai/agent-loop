require "json"
require "net/http"
require "time"
require "uri"

module AgentLoop
  class LocalModelClient
    DEFAULT_BASE_URL = "http://localhost:11434"
    DEFAULT_MODEL = "llama3.2:3b"
    DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
    DEEPSEEK_PREFIX = "deepseek:"
    DEFAULT_NUM_CTX = 4096
    DEFAULT_NUM_PREDICT = 768
    DEFAULT_OPEN_TIMEOUT = 5
    DEFAULT_READ_TIMEOUT = 90

    def initialize(
      base_url: ENV.fetch("OLLAMA_BASE_URL", DEFAULT_BASE_URL),
      model: ENV.fetch("OLLAMA_MODEL", DEFAULT_MODEL)
    )
      @base_url = base_url
      @provider, @model = normalize_model(model)
    end

    attr_reader :model, :provider

    def chat(messages:, temperature: 0.2, format: nil)
      chat_with_metrics(messages: messages, temperature: temperature, format: format)[:content]
    end

    def chat_with_metrics(messages:, temperature: 0.2, format: nil)
      return deepseek_chat_with_metrics(messages: messages, temperature: temperature, format: format) if deepseek?

      uri = URI.join(@base_url, "/api/chat")
      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      body = {
        model: @model,
        messages: messages,
        stream: true,
        options: {
          temperature: temperature,
          num_ctx: ENV.fetch("OLLAMA_NUM_CTX", DEFAULT_NUM_CTX).to_i,
          num_predict: ENV.fetch("OLLAMA_NUM_PREDICT", DEFAULT_NUM_PREDICT).to_i
        }
      }
      body[:format] = format if format
      request.body = body.to_json

      http = Net::HTTP.new(uri.hostname, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = ENV.fetch("OLLAMA_OPEN_TIMEOUT", DEFAULT_OPEN_TIMEOUT).to_i
      http.read_timeout = ENV.fetch("OLLAMA_READ_TIMEOUT", DEFAULT_READ_TIMEOUT).to_i

      started_at = Time.now.utc
      started_monotonic = monotonic_ms
      first_token_at = nil
      first_token_monotonic = nil
      last_token_at = nil
      last_token_monotonic = nil
      chunks = []
      buffer = +""
      capture_token = lambda do |line|
        parsed = JSON.parse(line)
        content = parsed.dig("message", "content").to_s
        next true if content.empty?

        now = Time.now.utc
        now_monotonic = monotonic_ms
        first_token_at ||= now
        first_token_monotonic ||= now_monotonic
        last_token_at = now
        last_token_monotonic = now_monotonic
        chunks << content
        true
      rescue JSON::ParserError
        false
      end

      response = http.request(request) do |res|
        raise ollama_error(res) unless res.is_a?(Net::HTTPSuccess)

        res.read_body do |chunk|
          buffer << chunk
          lines = buffer.split("\n", -1)
          buffer = lines.pop || +""

          lines.each_with_index do |line, index|
            next if line.blank?

            unless capture_token.call(line)
              buffer = ([ line ] + lines[(index + 1)..]).join("\n") + "\n" + buffer
              break
            end
          end
        end
      end
      capture_token.call(buffer) if buffer.present?

      completed_at = Time.now.utc
      completed_monotonic = monotonic_ms
      last_token_at ||= completed_at
      last_token_monotonic ||= completed_monotonic

      {
        content: chunks.join.strip,
        metrics: {
          provider: "ollama",
          model: @model,
          request_started_at: started_at.iso8601(6),
          first_token_at: first_token_at&.iso8601(6),
          last_token_at: last_token_at.iso8601(6),
          request_completed_at: completed_at.iso8601(6),
          first_token_latency_ms: first_token_monotonic ? first_token_monotonic - started_monotonic : nil,
          last_token_latency_ms: last_token_monotonic - started_monotonic,
          total_duration_ms: completed_monotonic - started_monotonic,
          streamed_chunks: chunks.length,
          http_status: response.code.to_i
        }
      }
    end

    def provider_label
      deepseek? ? "DeepSeek" : "Ollama"
    end

    def monotonic_ms
      (Process.clock_gettime(Process::CLOCK_MONOTONIC) * 1000).round
    end

    def normalize_model(model)
      value = model.to_s.presence || DEFAULT_MODEL
      return [ "deepseek", value.delete_prefix(DEEPSEEK_PREFIX) ] if value.start_with?(DEEPSEEK_PREFIX)

      [ "ollama", value ]
    end

    def deepseek?
      @provider == "deepseek"
    end

    def deepseek_chat_with_metrics(messages:, temperature: 0.2, format: nil)
      api_key = ENV["DEEPSEEK_API_KEY"].presence || ENV["DEEPSEEK_KEY"].presence
      raise "Thiếu DEEPSEEK_API_KEY trong backend env." if api_key.blank?

      uri = URI.join(ENV.fetch("DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL), "/chat/completions")
      request = Net::HTTP::Post.new(uri)
      request["Authorization"] = "Bearer #{api_key}"
      request["Content-Type"] = "application/json"
      body = {
        model: @model,
        messages: messages,
        temperature: temperature,
        stream: false
      }
      body[:response_format] = { type: "json_object" } if format == "json"
      request.body = body.to_json

      http = Net::HTTP.new(uri.hostname, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = ENV.fetch("DEEPSEEK_OPEN_TIMEOUT", DEFAULT_OPEN_TIMEOUT).to_i
      http.read_timeout = ENV.fetch("DEEPSEEK_READ_TIMEOUT", DEFAULT_READ_TIMEOUT).to_i

      started_at = Time.now.utc
      started_monotonic = monotonic_ms
      response = http.request(request)
      completed_at = Time.now.utc
      completed_monotonic = monotonic_ms
      raise deepseek_error(response) unless response.is_a?(Net::HTTPSuccess)

      parsed = JSON.parse(response.body)
      content = parsed.dig("choices", 0, "message", "content").to_s.strip
      {
        content: content,
        metrics: {
          provider: "deepseek",
          model: @model,
          request_started_at: started_at.iso8601(6),
          first_token_at: completed_at.iso8601(6),
          last_token_at: completed_at.iso8601(6),
          request_completed_at: completed_at.iso8601(6),
          first_token_latency_ms: completed_monotonic - started_monotonic,
          last_token_latency_ms: completed_monotonic - started_monotonic,
          total_duration_ms: completed_monotonic - started_monotonic,
          streamed_chunks: 1,
          http_status: response.code.to_i,
          usage: parsed["usage"]
        }
      }
    rescue JSON::ParserError => e
      raise "DeepSeek response không phải JSON hợp lệ: #{e.message}"
    end

    def ollama_error(response)
      parsed = JSON.parse(response.body)
      message = parsed["error"].to_s.presence || response.body
      if message.include?("llama-server process has terminated") || message.include?("signal: killed")
        return "Ollama model #{@model} bị hệ điều hành dừng giữa chừng. Thường do thiếu RAM/VRAM hoặc prompt quá dài; hãy dùng llama3.2:3b, giảm OLLAMA_NUM_CTX/OLLAMA_NUM_PREDICT, hoặc đóng bớt app nặng."
      end

      "Ollama request failed: #{response.code} #{message}"
    rescue JSON::ParserError
      "Ollama request failed: #{response.code} #{response.body}"
    end

    def deepseek_error(response)
      parsed = JSON.parse(response.body)
      message = parsed.dig("error", "message").presence || parsed["error"].to_s.presence || response.body
      "DeepSeek request failed: #{response.code} #{message}"
    rescue JSON::ParserError
      "DeepSeek request failed: #{response.code} #{response.body}"
    end
  end
end
