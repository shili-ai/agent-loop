module AgentLoop
  class ArtifactReviser
    def initialize(artifact:, message:, intent:, documents:, checks:, source_content: nil)
      @artifact = artifact || {}
      @message = message.to_s
      @intent = intent
      @documents = documents || []
      @checks = checks || []
      @source_content = source_content.to_s
    end

    def call
      rebuilt = ArtifactBuilder.new(
        intent: @intent,
        documents: @documents,
        message: @message,
        source_content: @source_content
      ).call
      {
        tool: rebuilt[:tool],
        artifact: rebuilt[:artifact],
        output: rebuilt[:output],
        summary: summary
      }
    end

    private

    def summary
      failed = @checks.reject { |check| check[:passed] }.map { |check| check[:label] }
      if failed.any?
        "Mình sửa lại bản nháp theo các điểm chưa đạt: #{failed.join(', ')}."
      else
        "Mình tạo phiên bản chỉnh sửa để bản nháp bám sát yêu cầu hơn trước khi kiểm tra lại."
      end
    end
  end
end
