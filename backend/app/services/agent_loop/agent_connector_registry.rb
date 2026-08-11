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
        description: "Dùng index tài liệu Google Drive đã sync để agent tìm kiếm song song cùng tài liệu upload.",
        enabled: false,
        status: "not_configured",
        index_path: DriveDocumentSearch::DEFAULT_INDEX_PATH,
        document_count: 0,
        browser_connected: false,
        auth_url_available: false,
        last_checked_at: nil,
        message: "Chưa cấu hình đường dẫn index Drive."
      }
    }.freeze

    class << self
      def all
        DEFAULT_CONNECTORS.keys.map { |key| find(key) }
      end

      def find(key)
        stored = config.fetch(key.to_s, {}).deep_symbolize_keys
        connector = DEFAULT_CONNECTORS.fetch(key).merge(default_runtime_config(key)).merge(stored)
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

        test_index(connector)
      end

      def google_drive_enabled?
        stored = config.fetch(GOOGLE_DRIVE_KEY, {})
        return ActiveModel::Type::Boolean.new.cast(stored["enabled"]) if stored.key?("enabled")

        default_runtime_config(GOOGLE_DRIVE_KEY)[:enabled]
      end

      def google_drive_index_path
        configured = find(GOOGLE_DRIVE_KEY)[:index_path].presence
        configured || ENV.fetch("GOOGLE_DRIVE_INDEX_PATH", DriveDocumentSearch::DEFAULT_INDEX_PATH)
      end

      private

      def config
        return {} unless File.exist?(CONFIG_PATH)

        JSON.parse(File.read(CONFIG_PATH))
      rescue JSON::ParserError
        {}
      end

      def default_runtime_config(key)
        return {} unless key == GOOGLE_DRIVE_KEY

        env_path = ENV["GOOGLE_DRIVE_INDEX_PATH"].presence
        index_path = env_path || DriveDocumentSearch::DEFAULT_INDEX_PATH
        {
          enabled: env_path.present? || File.exist?(index_path),
          index_path: index_path
        }
      end

      def write_config(payload)
        FileUtils.mkdir_p(File.dirname(CONFIG_PATH))
        File.write(CONFIG_PATH, JSON.pretty_generate(compact_nil_values(payload)))
      end

      def normalize_attributes(attributes)
        attrs = attributes.to_h.symbolize_keys.slice(:enabled, :index_path, :oauth_state)
        attrs[:enabled] = ActiveModel::Type::Boolean.new.cast(attrs[:enabled]) if attrs.key?(:enabled)
        attrs[:index_path] = attrs[:index_path].to_s.strip if attrs.key?(:index_path)
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

        test_index(connector)
      end

      def test_index(connector)
        index_path = connector[:index_path].presence || DriveDocumentSearch::DEFAULT_INDEX_PATH
        unless File.exist?(index_path)
          return connector.merge(
            status: "missing_index",
            document_count: 0,
            last_checked_at: Time.now.utc.iso8601(6),
            message: "Không tìm thấy file index tại #{index_path}."
          )
        end

        documents = JSON.parse(File.read(index_path))
        count = Array(documents).count
        connector.merge(
          status: "connected",
          document_count: count,
          last_checked_at: Time.now.utc.iso8601(6),
          message: "Đã đọc được #{count} tài liệu từ Drive index."
        )
      rescue JSON::ParserError => e
        connector.merge(
          status: "invalid_index",
          document_count: 0,
          last_checked_at: Time.now.utc.iso8601(6),
          message: "File index không phải JSON hợp lệ: #{e.message}."
        )
      end
    end
  end
end
