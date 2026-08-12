module AgentLoop
  class ClarificationPolicy
    RISKY_PATTERNS = [
      /xo[aá]\b/,
      /delete\b/,
      /remove\b/,
      /drop\b/,
      /reset\b/,
      /b[oỏ]\b.*\b(code|api|route|model|skill|prompt|connector|index|database|db)\b/,
      /đ[oổ]i\b.*\b(ki[eế]n tr[uú]c|provider|model|connector|api|database|db)\b/,
      /thay\b.*\b(ki[eế]n tr[uú]c|provider|model|connector|api|database|db)\b/
    ].freeze

    AMBIGUOUS_CHANGE_PATTERNS = [
      /\bl[aà]m th[eê]m\b/,
      /\bupdate\b/,
      /\bs[uử]a\b/,
      /\bc[aả]i thi[eệ]n\b/,
      /\bt[oố]i [uư]u\b/,
      /\bcho ph[uù] h[oợ]p\b/,
      /\bg[oọ]n h[oơ]n\b/
    ].freeze

    CONFIRMATION_PATTERNS = [
      /x[aá]c nh[aậ]n/,
      /\bconfirm\b/,
      /\bok\b.*\b(xo[aá]|delete|remove|b[oỏ]|đ[oổ]i|thay)\b/,
      /ch[aắ]c ch[aắ]n/
    ].freeze

    def initialize(message:, state: {}, context: {})
      @message = message.to_s
      @state = state || {}
      @context = context || {}
    end

    def required?
      return true if clarification_help_request?
      return true if estimate_request? && !estimate_context_available?
      return false if already_clarified?
      return true if risky_change?
      return true if ambiguous_change?

      false
    end

    def reason
      return "Mình đã chuẩn bị form để bạn bổ sung đúng các thông tin còn thiếu." if clarification_help_request?
      return "Estimate cần chốt phạm vi, định dạng đầu ra và đơn vị ước lượng trước khi tính." if estimate_request? && !estimate_context_available?
      return "Yêu cầu có thể xoá/đổi cấu trúc hoặc thay đổi hành vi quan trọng, cần xác nhận phạm vi trước khi làm." if risky_change?
      return "Yêu cầu còn có nhiều cách hiểu hợp lý, cần hỏi lại để chọn đúng hướng." if ambiguous_change?

      "Yêu cầu cần làm rõ thêm."
    end

    def category
      return "estimate" if clarification_help_request? && estimate_request?
      return "estimate" if estimate_request? && !estimate_context_available?
      return "risky_change" if risky_change?
      return "ambiguous_change" if ambiguous_change?

      "general"
    end

    private

    def risky_change?
      normalized.match?(Regexp.union(RISKY_PATTERNS)) && !confirmed?
    end

    def estimate_request?
      conversation_text.match?(/\b(est|estimate)\b/) || conversation_text.match?(/ước lượng|uoc luong/)
    end

    def estimate_context_available?
      context_text = [ @message, *recent_user_messages ].join("\n").downcase
      has_scope = context_text.match?(/phạm vi|scope|chức năng|tích hợp|integration|gateway|webhook/)
      has_format_or_unit = context_text.match?(/markdown|csv|bảng|giờ|hour|man-day|usd|vnd|đơn vị|định dạng/)
      has_scope && has_format_or_unit
    end

    def ambiguous_change?
      return false if normalized.split.length >= 18
      return false if normalized.match?(/[?？]\z/)

      normalized.match?(Regexp.union(AMBIGUOUS_CHANGE_PATTERNS)) && broad_target?
    end

    def broad_target?
      normalized.match?(/\b(code|api|ui|flow|agent|model|skill|prompt|connector|drive|mcp|search|retrieval|rag|project|chat|system|database|db)\b/) ||
        normalized.match?(/\b(h[eệ] th[oố]ng|d[uự] [aá]n|m[aà]n h[iì]nh|ch[uứ]c n[aă]ng)\b/)
    end

    def confirmed?
      normalized.match?(Regexp.union(CONFIRMATION_PATTERNS))
    end

    def already_clarified?
      @state[:clarification].present? ||
        normalized.include?("bổ sung ngữ cảnh:")
    end

    def clarification_help_request?
      normalized.match?(/c[aầ]n\s+(b[oổ]\s*sung|th[eê]m).*g[iì]/) || normalized.match?(/b[oổ]\s*sung.*g[iì]/)
    end

    def conversation_text
      @conversation_text ||= [ @message, *recent_messages ].join("\n").downcase
    end

    def recent_messages
      Array(@context[:recent_messages]).filter_map { |message| message[:content] || message["content"] }
    end

    def recent_user_messages
      Array(@context[:recent_messages]).filter_map do |message|
        role = message[:role] || message["role"]
        next unless role == "user"

        message[:content] || message["content"]
      end
    end

    def normalized
      @normalized ||= @message.downcase
    end
  end
end
