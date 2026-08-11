require "json"
require "net/http"
require "uri"
require "cgi"

module AgentLoop
  class ElasticsearchDocumentStore
    DEFAULT_INDEX = "agent_loop_documents".freeze
    DEFAULT_TIMEOUT = 2

    def self.enabled?
      ENV["ELASTICSEARCH_URL"].present?
    end

    def initialize(
      url: ENV["ELASTICSEARCH_URL"],
      index: ENV.fetch("ELASTICSEARCH_DOCUMENT_INDEX", DEFAULT_INDEX),
      timeout: ENV.fetch("ELASTICSEARCH_TIMEOUT", DEFAULT_TIMEOUT).to_f
    )
      @url = url.to_s
      @index = index
      @timeout = timeout
    end

    def index_document(document)
      return false unless enabled?

      ensure_index!
      request(
        :put,
        "/#{escape(@index)}/_doc/#{document.id}",
        document_payload(document)
      )
      true
    rescue StandardError => e
      Rails.logger.warn("[AgentLoop::ElasticsearchDocumentStore] index failed: #{e.class}: #{e.message}")
      false
    end

    def delete_document(document_id)
      return false unless enabled?

      request(:delete, "/#{escape(@index)}/_doc/#{document_id}")
      true
    rescue StandardError => e
      Rails.logger.warn("[AgentLoop::ElasticsearchDocumentStore] delete failed: #{e.class}: #{e.message}")
      false
    end

    def search(query:, conversation:, limit: DocumentSearch::DEFAULT_LIMIT)
      return [] unless enabled?

      response = request(:post, "/#{escape(@index)}/_search", search_payload(query: query, conversation: conversation, limit: limit))
      parse_results(JSON.parse(response.body))
    rescue StandardError => e
      Rails.logger.warn("[AgentLoop::ElasticsearchDocumentStore] search failed: #{e.class}: #{e.message}")
      []
    end

    def sync_all(scope = AgentDocument.where.not(content: [ nil, "" ]))
      return 0 unless enabled?

      count = 0
      scope.find_each do |document|
        count += 1 if index_document(document)
      end
      count
    end

    private

    def enabled?
      self.class.enabled? && @url.present?
    end

    def ensure_index!
      return if @ensured_index

      response = request(:head, "/#{escape(@index)}")
      if response.is_a?(Net::HTTPSuccess)
        @ensured_index = true
      else
        request(:put, "/#{escape(@index)}", index_mapping)
        @ensured_index = true
      end
    rescue RuntimeError
      request(:put, "/#{escape(@index)}", index_mapping)
      @ensured_index = true
    end

    def index_mapping
      {
        settings: {
          number_of_replicas: 0
        },
        mappings: {
          properties: {
            title: { type: "text" },
            filename: { type: "text" },
            content: { type: "text" },
            summary: { type: "text" },
            agent_project_id: { type: "long" },
            agent_conversation_id: { type: "long" },
            source: { type: "keyword" },
            created_at: { type: "date" },
            updated_at: { type: "date" }
          }
        }
      }
    end

    def document_payload(document)
      {
        id: document.id,
        title: document.title,
        filename: document.filename,
        content_type: document.content_type,
        byte_size: document.byte_size,
        summary: document.summary,
        content: document.content,
        agent_project_id: document.agent_project_id,
        agent_conversation_id: document.agent_conversation_id,
        source: document.agent_conversation_id.present? ? "chat" : "project",
        created_at: document.created_at&.iso8601,
        updated_at: document.updated_at&.iso8601
      }
    end

    def search_payload(query:, conversation:, limit:)
      filters = [
        { term: { agent_conversation_id: conversation.id } }
      ]
      filters << { term: { agent_project_id: conversation.agent_project_id } } if conversation.agent_project_id.present?

      {
        size: limit,
        query: query.to_s.strip.present? ? {
          bool: {
            must: [
              {
                multi_match: {
                  query: query.to_s,
                  fields: [ "title^4", "filename^3", "summary^2", "content" ],
                  fuzziness: "AUTO"
                }
              }
            ],
            filter: [
              {
                bool: {
                  should: filters,
                  minimum_should_match: 1
                }
              }
            ]
          }
        } : { bool: { must: [ { match_all: {} } ], filter: [ { bool: { should: filters, minimum_should_match: 1 } } ] } },
        highlight: {
          fields: {
            content: { fragment_size: 180, number_of_fragments: 2 },
            summary: { fragment_size: 180, number_of_fragments: 1 }
          }
        }
      }
    end

    def parse_results(payload)
      Array(payload.dig("hits", "hits")).map do |hit|
        source = hit["_source"] || {}
        {
          title: source["title"],
          type: "elasticsearch_file",
          source: source["agent_conversation_id"].present? ? "chat://documents/#{source['id']}" : "project://documents/#{source['id']}",
          snippet: snippet_for(hit, source),
          filename: source["filename"],
          document_id: source["id"],
          search_provider: "elasticsearch",
          score: hit["_score"]
        }
      end
    end

    def snippet_for(hit, source)
      highlighted = Array(hit.dig("highlight", "content")).presence || Array(hit.dig("highlight", "summary"))
      snippet = highlighted.join(" … ").presence || source["summary"].presence || source["content"].to_s.squish.first(360)
      snippet.to_s.gsub(%r{</?em>}, "")
    end

    def request(method, path, payload = nil)
      uri = URI.join("#{@url}/", path.sub(%r{\A/}, ""))
      request = request_for(method, uri)
      request.basic_auth(uri.user, uri.password) if uri.user.present?
      if payload
        request["Content-Type"] = "application/json"
        request.body = JSON.generate(payload)
      end

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: @timeout, read_timeout: @timeout) do |http|
        http.request(request)
      end
      return response if response.is_a?(Net::HTTPSuccess)
      return response if method == :head && response.is_a?(Net::HTTPNotFound)

      raise "Elasticsearch request failed: #{response.code} #{response.body}"
    end

    def request_for(method, uri)
      case method
      when :get then Net::HTTP::Get.new(uri)
      when :post then Net::HTTP::Post.new(uri)
      when :put then Net::HTTP::Put.new(uri)
      when :delete then Net::HTTP::Delete.new(uri)
      when :head then Net::HTTP::Head.new(uri)
      else raise ArgumentError, "Unsupported method #{method}"
      end
    end

    def escape(value)
      CGI.escape(value.to_s)
    end
  end
end
