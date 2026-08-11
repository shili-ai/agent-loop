require "json"
require "fileutils"

module AgentLoop
  class AgentConnectorRegistry
    CONFIG_PATH = Rails.root.join("storage/agent_connectors.json").to_s
    GOOGLE_DRIVE_KEY = "google_drive".freeze

    DEFAULT_CONNECTORS = {
      GOOGLE_DRIVE_KEY => {
        key: GOOGLE_DRIVE_KEY,
        name: "Google Drive",
        description: "Tìm trực tiếp trên Google Drive qua API khi agent cần tài liệu.",
        enabled: false,
        status: "not_configured",
        document_count: 0,
        browser_connected: false,
        auth_url_available: false,
        last_checked_at: nil,
        message: "Chưa kết nối Google Drive trên trình duyệt."
      }
    }.freeze

    class << self
      def all
        DEFAULT_CONNECTORS.keys.map { |key| find(key) }
      end

      def find(key)
        stored = config.fetch(key.to_s, {}).deep_symbolize_keys
        connector = DEFAULT_CONNECTORS.fetch(key).merge(stored)
        refresh_status(connector)
      end

      def update(key, attributes)
        raise KeyError, "Unknown connector: #{key}" unless DEFAULT_CONNECTORS.key?(key)

        payload = config
        current = payload.fetch(key.to_s, {})
        payload[key.to_s] = current.merge(normalize_attributes(attributes).stringify_keys)
        write_config(payload)
        find(key)
      end

      def test(key)
        connector = find(key)
        return connector.merge(status: "disabled", message: "Connector đang tắt.") unless connector[:enabled]

        test_live_connection(connector)
      end

      def google_drive_enabled?
        stored = config.fetch(GOOGLE_DRIVE_KEY, {})
        return ActiveModel::Type::Boolean.new.cast(stored["enabled"]) if stored.key?("enabled")

        false
      end

      private

      def config
        return {} unless File.exist?(CONFIG_PATH)

        JSON.parse(File.read(CONFIG_PATH))
      rescue JSON::ParserError
        {}
      end

      def write_config(payload)
        FileUtils.mkdir_p(File.dirname(CONFIG_PATH))
        File.write(CONFIG_PATH, JSON.pretty_generate(compact_nil_values(payload)))
      end

      def normalize_attributes(attributes)
        attrs = attributes.to_h.symbolize_keys.slice(:enabled, :oauth_state)
        attrs[:enabled] = ActiveModel::Type::Boolean.new.cast(attrs[:enabled]) if attrs.key?(:enabled)
        attrs.compact.tap do |normalized|
          normalized[:oauth_state] = attrs[:oauth_state] if attrs.key?(:oauth_state)
        end
      end

      def compact_nil_values(value)
        case value
        when Hash
          value.each_with_object({}) do |(key, item), output|
            compacted = compact_nil_values(item)
            output[key] = compacted unless compacted.nil?
          end
        when Array
          value.filter_map { |item| compact_nil_values(item) }
        else
          value
        end
      end

      def refresh_status(connector)
        connector = connector.merge(
          browser_connected: GoogleDriveConnector.connected?,
          auth_url_available: GoogleDriveConnector.configured?
        )
        return connector.merge(status: "disabled", document_count: 0, message: "Connector đang tắt.") unless connector[:enabled]

        test_live_connection(connector)
      end

      def test_live_connection(connector)
        return connector.merge(status: "missing_auth", document_count: 0, message: "Chưa kết nối Google Drive trên trình duyệt.") unless GoogleDriveConnector.connected?

        connector.merge(GoogleDriveConnector.live_test)
      rescue StandardError => e
        connector.merge(
          status: "connection_error",
          document_count: 0,
          last_checked_at: Time.now.utc.iso8601(6),
          message: "Không test được Google Drive API: #{e.message}."
        )
      end
    end
  end
end
