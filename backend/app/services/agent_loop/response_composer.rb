module AgentLoop
  class ResponseComposer
    def initialize(intent:, tool_result:, user_message:)
      @intent = intent
      @tool_result = tool_result
      @user_message = user_message
    end

    def call
      artifact = @tool_result[:artifact]
      lines = []

      lines << headline
      lines << ""
      lines << artifact[:title]
      artifact[:bullets].each { |bullet| lines << "- #{bullet}" }
      lines << ""
      lines << "Nguon dummy:"
      @tool_result[:documents].each do |document|
        lines << "- #{document[:title]} (#{document[:type]}): #{document[:snippet]}"
      end
      lines << ""
      lines << missing_context_prompt if needs_more_context?

      lines.compact.join("\n")
    end

    private

    def headline
      case @intent
      when "proposal" then "Minh se phac thao proposal dua tren tai lieu gan nhat."
      when "battlecard" then "Day la battlecard nhanh cho tinh huong presales."
      when "follow_up" then "Day la khung follow-up co the gui sau buoi discovery."
      when "rfp_answer" then "Day la cach draft cau tra loi RFP/RFI co dan nguon."
      else "Minh da tim tai lieu lien quan va tom tat huong xu ly."
      end
    end

    def needs_more_context?
      @user_message.split.length < 8
    end

    def missing_context_prompt
      "Can them ngu canh de chinh xac hon: ten san pham, loai khach hang, va output ban muon la email, proposal, hay battlecard?"
    end
  end
end
