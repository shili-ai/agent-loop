module AgentLoop
  class RunFlowBuilder
    LABELS = {
      "context" => "Đọc ngữ cảnh",
      "reasoning" => "Phân tích yêu cầu",
      "plan" => "Lập plan",
      "decision" => "Chọn action",
      "retrieval" => "Tìm nguồn",
      "document_search" => "Tìm tài liệu",
      "web_search" => "Tìm trên web",
      "web_read" => "Đọc trang web",
      "artifact" => "Soạn bản nháp",
      "verification" => "Kiểm tra bản nháp",
      "clarification" => "Hỏi làm rõ",
      "evaluation" => "Đánh giá",
      "llm" => "Gọi model",
      "answer" => "Trả lời cuối",
      "error" => "Lỗi"
    }.freeze

    ACTION_LABELS = {
      "search_documents" => "Tìm tài liệu",
      "web_search" => "Tìm trên web",
      "draft_artifact" => "Soạn bản nháp",
      "verify_artifact" => "Kiểm tra bản nháp",
      "revise_artifact" => "Sửa bản nháp",
      "ask_clarification" => "Hỏi làm rõ",
      "final_answer" => "Trả lời cuối"
    }.freeze

    MAX_ITEMS = 3

    def initialize(run:)
      @run = run
    end

    def call
      steps = @run.agent_steps.order(:position).reject { |step| step.kind == "flow" }
      {
        diagram: diagram(steps),
        output: "### Sơ đồ luồng đã chạy\nAgent đã đi qua #{steps.count} bước trước khi hoàn tất câu trả lời."
      }
    end

    private

    def diagram(steps)
      lines = [ "flowchart TD" ]
      prev_exits = []
      steps.each_with_index do |step, index|
        node = build_step_node(step, index)
        lines.concat(node[:lines])
        prev_exits.each { |from| lines << "  #{from} --> #{node[:entry]}" }
        prev_exits = node[:exits]
      end
      lines.join("\n")
    end

    # Trả về {entry, exits, lines}. Bước thường: 1 node vào = ra. Bước retrieval
    # chạy nhiều tool song song thì fan-out thành nhiều nhánh, hợp lại ở bước sau.
    def build_step_node(step, index)
      base = node_id(index)
      header = "  #{base}[\"#{node_label(step, index)}\"]"
      lanes = step.kind == "retrieval" ? retrieval_lanes(step) : []
      return { entry: base, exits: [ base ], lines: [ header ] } if lanes.size < 2

      lines = [ header ]
      exits = []
      lanes.each_with_index do |lane, lane_index|
        previous = base
        lane.each_with_index do |label, node_index|
          nid = "#{base}L#{lane_index}N#{node_index}"
          lines << "  #{nid}[\"#{label}\"]"
          lines << "  #{previous} --> #{nid}"
          previous = nid
        end
        exits << previous
      end
      { entry: base, exits: exits, lines: lines }
    end

    # Mỗi lane là chuỗi tuần tự chạy song song với các lane khác, kèm kết quả thật.
    def retrieval_lanes(step)
      data = step.data || {}
      tools = Array(data["tools"] || data[:tools]).map(&:to_s)
      documents = Array(data["documents"] || data[:documents])
      web_results = Array(data["web_results"] || data[:web_results])
      pages = Array(data["pages"] || data[:pages])

      lanes = []
      if tools.include?("document_search")
        internal = documents.reject { |document| drive_doc?(document) }
        lanes << [ lane_label("Tìm tài liệu nội bộ", titles_of(internal)) ]
      end
      if tools.include?("drive_document_search")
        drive = documents.select { |document| drive_doc?(document) }
        lanes << [ lane_label("Google Drive", titles_of(drive)) ]
      end
      web_lane = []
      if tools.include?("web_search")
        web_lane <<
          if web_results.any?
            lane_label("Tìm trên web", titles_of(web_results))
          else
            web_empty_label(data)
          end
      end
      if tools.include?("web_page_reader")
        read = pages.select { |page| (page["status"] || page[:status]).to_s == "read" }
        web_lane << lane_label("Đọc trang web", [ "#{read.count} trang đọc được" ])
      end
      lanes << web_lane if web_lane.any?
      lanes
    end

    # Khi web không có kết quả đạt chuẩn: nói rõ vì sao (đã có bao nhiêu kết quả
    # thô, và lý do bị loại lấy từ danh sách ứng viên).
    def web_empty_label(data)
      raw = Array(data["web_raw_results"] || data[:web_raw_results])
      candidates = Array(data["web_candidates"] || data[:web_candidates])

      lines = [ escape("Tìm trên web") ]
      if raw.empty?
        lines << "không có kết quả thô trả về"
      else
        lines << "0/#{raw.size} đạt chuẩn"
        reasons = candidates.map { |candidate| candidate["reason"] || candidate[:reason] }.compact.uniq.first(2)
        reasons.each { |reason| lines << "• loại: #{escape(reason)}" }
        lines << "• #{escape(candidates.size)} ứng viên bị lọc" if reasons.empty? && candidates.any?
      end
      lines.join("<br/>")
    end

    def drive_doc?(document)
      source = (document["source"] || document[:source]).to_s
      type = (document["type"] || document[:type]).to_s
      provider = (document["search_provider"] || document[:search_provider]).to_s
      source.start_with?("drive://") || type == "google_drive" || provider == "drive"
    end

    def titles_of(items)
      names = Array(items).map { |item| item["title"] || item[:title] }.compact
      return names if names.size <= MAX_ITEMS

      names.first(MAX_ITEMS) + [ "+#{names.size - MAX_ITEMS} nữa" ]
    end

    def lane_label(title, items)
      lines = [ escape(title) ]
      if items.blank?
        lines << "(không có kết quả)"
      else
        items.each { |item| lines << "• #{escape(item)}" }
      end
      lines.join("<br/>")
    end

    def node_id(index)
      "S#{index + 1}"
    end

    def node_label(step, index)
      lines = [ "#{index + 1}. #{escape(LABELS.fetch(step.kind, step.title))}" ]
      lines.concat(detail_lines(step))
      lines.join("<br/>")
    end

    # Mỗi bước ghi thêm kết quả thật rút từ data để nhìn sơ đồ là hiểu đã ra gì.
    def detail_lines(step)
      data = step.data || {}
      case step.kind
      when "context" then context_lines(data)
      when "retrieval" then retrieval_header_lines(data)
      when "reasoning" then reasoning_lines(data)
      when "plan" then plan_lines(data)
      when "evaluation" then evaluation_lines(data)
      when "decision" then decision_lines(data)
      when "llm" then llm_lines(data)
      when "answer" then answer_lines(data)
      else []
      end
    end

    def context_lines(data)
      lines = []
      project = data["project"] || data[:project]
      if project.is_a?(Hash)
        title = project["title"] || project[:title]
        lines << "project: #{escape(title)}" if title.present?
      end
      conversation = data["conversation"] || data[:conversation]
      if conversation.is_a?(Hash)
        customer = conversation["customer_name"] || conversation[:customer_name]
        lines << "khách hàng: #{escape(customer)}" if customer.present?
      end
      messages = data["recent_messages"] || data[:recent_messages]
      lines << "#{Array(messages).size} tin nhắn gần đây" if Array(messages).any?
      lines
    end

    def retrieval_header_lines(data)
      keywords = Array(data["keywords"] || data[:keywords]).map(&:to_s).reject(&:blank?)
      lines = []
      lines << "từ khoá: #{escape(keywords.first(6).join(', '))}" if keywords.any?
      reformulated = data["reformulated_query"] || data[:reformulated_query]
      lines << "thử lại: #{escape(reformulated)}" if reformulated.present?
      lines
    end

    def reasoning_lines(data)
      intent = data["intent"] || data[:intent]
      intent.present? ? [ "intent: #{escape(intent)}" ] : []
    end

    def plan_lines(data)
      steps = Array(data["steps"] || data[:steps])
      if steps.any?
        steps.first(6).map do |plan_step|
          title = plan_step["title"] || plan_step[:title] || humanize_action(plan_step["action"] || plan_step[:action])
          "• #{escape(title)}"
        end
      elsif (goal = data["goal"] || data[:goal]).present?
        [ escape(truncate(goal, 80)) ]
      else
        []
      end
    end

    def evaluation_lines(data)
      after = data["after_counts"] || data[:after_counts] || {}
      kept = %w[documents web_results web_pages].sum { |key| (after[key] || after[key.to_sym]).to_i }
      docs = (after["documents"] || after[:documents]).to_i
      web = (after["web_results"] || after[:web_results]).to_i
      [ "giữ #{kept} nguồn (tài liệu #{docs}, web #{web})" ]
    end

    def decision_lines(data)
      action = data["action"] || data[:action]
      action.present? ? [ "→ #{escape(humanize_action(action))}" ] : []
    end

    def llm_lines(data)
      model = data["model"] || data[:model]
      model.present? ? [ escape(model) ] : []
    end

    def answer_lines(data)
      output = data["output"] || data[:output]
      return [] if output.blank?

      [ "#{output.to_s.length} ký tự" ]
    end

    def humanize_action(action)
      ACTION_LABELS.fetch(action.to_s, action.to_s)
    end

    def truncate(text, limit)
      string = text.to_s
      string.length > limit ? "#{string[0, limit]}…" : string
    end

    def escape(text)
      text.to_s.gsub(/[\r\n]+/, " ").gsub('"', "'").gsub(/[\[\]|]/, "").strip
    end
  end
end
