require "json"
require "fileutils"
require "net/http"
require "securerandom"
require "uri"

module AgentLoop
  class GoogleDriveConnector
    AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth".freeze
    TOKEN_URL = "https://oauth2.googleapis.com/token".freeze
    FILES_URL = "https://www.googleapis.com/drive/v3/files".freeze
    TOKEN_PATH = Rails.root.join("storage/google_drive_token.json").to_s
    DEFAULT_REDIRECT_URI = "http://localhost:3000/api/agent_connectors/google_drive/callback".freeze
    DEFAULT_FRONTEND_URL = "http://localhost:3001/connectors".freeze
    SCOPES = [
      "https://www.googleapis.com/auth/drive.readonly"
    ].freeze

    def self.configured?
      client_id.present? && client_secret.present?
    end

    def self.client_id
      ENV["GOOGLE_DRIVE_CLIENT_ID"].presence || ENV["GOOGLE_CLIENT_ID"].presence
    end

    def self.client_secret
      ENV["GOOGLE_DRIVE_CLIENT_SECRET"].presence || ENV["GOOGLE_CLIENT_SECRET"].presence
    end

    def self.redirect_uri
      ENV.fetch("GOOGLE_DRIVE_REDIRECT_URI", DEFAULT_REDIRECT_URI)
    end

    def self.frontend_url
      ENV.fetch("FRONTEND_URL", DEFAULT_FRONTEND_URL)
    end

    def self.connected?
      token[:refresh_token].present? || token[:access_token].present?
    end

    def self.auth_url
      raise "Thiếu GOOGLE_DRIVE_CLIENT_ID/GOOGLE_DRIVE_CLIENT_SECRET" unless configured?

      state = SecureRandom.hex(16)
      AgentConnectorRegistry.update(AgentConnectorRegistry::GOOGLE_DRIVE_KEY, oauth_state: state)
      uri = URI(AUTH_URL)
      uri.query = URI.encode_www_form(
        client_id: client_id,
        redirect_uri: redirect_uri,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state: state
      )
      uri.to_s
    end

    def self.exchange_code!(code:, state:)
      connector = AgentConnectorRegistry.find(AgentConnectorRegistry::GOOGLE_DRIVE_KEY)
      expected_state = connector[:oauth_state].to_s
      raise "OAuth state không hợp lệ" if expected_state.present? && state.to_s != expected_state

      response = post_form(
        TOKEN_URL,
        code: code,
        client_id: client_id,
        client_secret: client_secret,
        redirect_uri: redirect_uri,
        grant_type: "authorization_code"
      )
      save_token!(response)
      AgentConnectorRegistry.update(AgentConnectorRegistry::GOOGLE_DRIVE_KEY, enabled: true, oauth_state: nil)
    end

    def self.sync!(limit: 50)
      access_token = valid_access_token
      files = list_files(access_token, limit: limit)
      documents = files.filter_map { |file| document_from_file(file, access_token) }
      index_path = AgentConnectorRegistry.google_drive_index_path
      FileUtils.mkdir_p(File.dirname(index_path))
      File.write(index_path, JSON.pretty_generate(documents))
      AgentConnectorRegistry.update(AgentConnectorRegistry::GOOGLE_DRIVE_KEY, enabled: true)
      AgentConnectorRegistry.test(AgentConnectorRegistry::GOOGLE_DRIVE_KEY)
    end

    def self.token
      return {} unless File.exist?(TOKEN_PATH)

      JSON.parse(File.read(TOKEN_PATH), symbolize_names: true)
    rescue JSON::ParserError
      {}
    end

    def self.disconnect!
      FileUtils.rm_f(TOKEN_PATH)
      AgentConnectorRegistry.update(AgentConnectorRegistry::GOOGLE_DRIVE_KEY, enabled: false, oauth_state: nil)
    end

    def self.valid_access_token
      current = token
      return current[:access_token] if current[:access_token].present? && Time.at(current[:expires_at].to_i) > 60.seconds.from_now

      refresh_token = current[:refresh_token].presence
      raise "Chưa có refresh token Google Drive. Hãy kết nối lại trên trình duyệt." unless refresh_token

      refreshed = post_form(
        TOKEN_URL,
        client_id: client_id,
        client_secret: client_secret,
        refresh_token: refresh_token,
        grant_type: "refresh_token"
      )
      save_token!(refreshed.merge(refresh_token: refresh_token))
      refreshed[:access_token]
    end

    def self.list_files(access_token, limit:)
      uri = URI(FILES_URL)
      uri.query = URI.encode_www_form(
        pageSize: limit,
        fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
        q: "trashed = false"
      )
      response = get_json(uri, access_token)
      Array(response[:files])
    end

    def self.document_from_file(file, access_token)
      content = file_content(file, access_token)
      return nil if content.blank?

      {
        id: file[:id],
        title: file[:name],
        filename: file[:name],
        type: file[:mimeType],
        url: file[:webViewLink],
        modified_at: file[:modifiedTime],
        content: content,
        summary: content.to_s.squish.first(500)
      }
    rescue StandardError
      nil
    end

    def self.file_content(file, access_token)
      mime_type = file[:mimeType].to_s
      if google_workspace_file?(mime_type)
        export_file(file[:id], export_mime_type(mime_type), access_token)
      elsif text_file?(mime_type)
        download_file(file[:id], access_token)
      end
    end

    def self.google_workspace_file?(mime_type)
      mime_type.start_with?("application/vnd.google-apps.")
    end

    def self.text_file?(mime_type)
      mime_type.start_with?("text/") || mime_type.in?(%w[application/json application/xml])
    end

    def self.export_mime_type(mime_type)
      return "text/csv" if mime_type == "application/vnd.google-apps.spreadsheet"

      "text/plain"
    end

    def self.export_file(file_id, mime_type, access_token)
      uri = URI("#{FILES_URL}/#{file_id}/export")
      uri.query = URI.encode_www_form(mimeType: mime_type)
      get_text(uri, access_token)
    end

    def self.download_file(file_id, access_token)
      uri = URI("#{FILES_URL}/#{file_id}")
      uri.query = URI.encode_www_form(alt: "media")
      get_text(uri, access_token)
    end

    def self.post_form(url, params)
      uri = URI(url)
      response = Net::HTTP.post_form(uri, params)
      parsed = JSON.parse(response.body, symbolize_names: true)
      raise parsed[:error_description] || parsed[:error] || "Google API lỗi #{response.code}" unless response.is_a?(Net::HTTPSuccess)

      parsed
    end

    def self.get_json(uri, access_token)
      JSON.parse(get_text(uri, access_token), symbolize_names: true)
    end

    def self.get_text(uri, access_token)
      request = Net::HTTP::Get.new(uri)
      request["Authorization"] = "Bearer #{access_token}"
      response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") { |http| http.request(request) }
      raise "Google API lỗi #{response.code}: #{response.body.first(160)}" unless response.is_a?(Net::HTTPSuccess)

      response.body
    end

    def self.save_token!(payload)
      FileUtils.mkdir_p(File.dirname(TOKEN_PATH))
      expires_at = Time.now.to_i + payload[:expires_in].to_i
      merged = token.merge(payload.slice(:access_token, :refresh_token, :scope, :token_type)).merge(expires_at: expires_at)
      File.write(TOKEN_PATH, JSON.pretty_generate(merged))
    end
  end
end
