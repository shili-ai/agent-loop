module AgentLoop
  # Dựng graph (nodes + edges có sẵn toạ độ) để frontend render bằng React Flow.
  # Bước retrieval chạy nhiều tool song song thì fan-out thành nhiều lane, hợp lại
  # ở bước kế tiếp. Mỗi node kèm chi tiết kết quả thật rút từ data của step.
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

    MAX_ITEMS = 4
    COL_W = 260
    ROW_H = 150

    def initialize(run:)
      @run = run
    end

    def call
      steps = @run.agent_steps.order(:position).reject { |step| step.kind == "flow" }
      graph = build_graph(steps)
      {
        nodes: graph[:nodes],
        edges: graph[:edges]
      }
    end

    private

    def build_graph(steps)
      nodes = []
      edges = []
      row = 0
      prev_exits = []

      steps.each_with_index do |step, index|
        base = node_id(index)
        lanes = step.kind == "retrieval" ? retrieval_lanes(step) : []

        nodes << graph_node(base, step.kind, node_title(step, index), detail_lines(step), col: 0, row: row)
        header_row = row
        row += 1

        if lanes.size < 2
          exits = [ base ]
        else
          exits = []
          offset = (lanes.size - 1) / 2.0
          lanes.each_with_index do |lane, lane_index|
            col = lane_index - offset
            previous = base
            lane.each_with_index do |lane_node, node_index|
              nid = "#{base}L#{lane_index}N#{node_index}"
              nodes << graph_node(nid, "lane", lane_node[:title], lane_node[:details], col: col, row: header_row + 1 + node_index)
              edges << edge(previous, nid)
              previous = nid
            end
            exits << previous
          end
          row = header_row + 1 + lanes.map(&:size).max
        end

        prev_exits.each { |from| edges << edge(from, base) }
        prev_exits = exits
      end

      { nodes: nodes, edges: edges }
    end

    def graph_node(id, kind, title, details, col:, row:)
      {
        id: id,
        position: { x: (col * COL_W).round, y: row * ROW_H },
        data: { kind: kind, title: title, details: Array(details).reject(&:blank?) }
      }
    end

    def edge(source, target)
      { id: "#{source}-#{target}", source: source, target: target }
    end

    def node_id(index)
      "S#{index + 1}"
    end

    def node_title(step, index)
      "#{index + 1}. #{LABELS.fetch(step.kind, step.title)}"
    end

    # ----- Lane cho bước retrieval -----

    def retrieval_lanes(step)
      data = step.data || {}
      tools = Array(data["tools"] || data[:tools]).map(&:to_s)
      documents = Array(data["documents"] || data[:documents])
      web_results = Array(data["web_results"] || data[:web_results])
      pages = Array(data["pages"] || data[:pages])

      lanes = []
      if tools.include?("document_search")
        internal = documents.reject { |document| drive_doc?(document) }
        lanes << [ { title: "Tìm tài liệu nội bộ", details: bullet_details(titles_of(internal)) } ]
      end
      if tools.include?("drive_document_search")
        drive = documents.select { |document| drive_doc?(document) }
        lanes << [ { title: "Google Drive", details: bullet_details(titles_of(drive)) } ]
      end
      web_lane = []
      web_lane << { title: "Tìm trên web", details: web_details(data, web_results) } if tools.include?("web_search")
      if tools.include?("web_page_reader")
        read = pages.select { |page| (page["status"] || page[:status]).to_s == "read" }
        web_lane << { title: "Đọc trang web", details: [ "#{read.count} trang đọc được" ] }
      end
      lanes << web_lane if web_lane.any?
      lanes
    end

    def web_details(data, web_results)
      return bullet_details(titles_of(web_results)) if web_results.any?

      raw = Array(data["web_raw_results"] || data[:web_raw_results])
      candidates = Array(data["web_candidates"] || data[:web_candidates])
      return [ "không có kết quả thô trả về" ] if raw.empty?

      lines = [ "0/#{raw.size} đạt chuẩn" ]
      reasons = candidates.map { |candidate| candidate["reason"] || candidate[:reason] }.compact.uniq.first(2)
      reasons.each { |reason| lines << "loại: #{clean(reason)}" }
      lines
    end

    def bullet_details(titles)
      return [ "(không có kết quả)" ] if titles.blank?

      titles.map { |title| "• #{clean(title)}" }
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

    # ----- Chi tiết cho từng loại bước -----

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
        lines << "project: #{clean(title)}" if title.present?
      end
      conversation = data["conversation"] || data[:conversation]
      if conversation.is_a?(Hash)
        customer = conversation["customer_name"] || conversation[:customer_name]
        lines << "khách hàng: #{clean(customer)}" if customer.present?
      end
      messages = data["recent_messages"] || data[:recent_messages]
      lines << "#{Array(messages).size} tin nhắn gần đây" if Array(messages).any?
      lines
    end

    def retrieval_header_lines(data)
      keywords = Array(data["keywords"] || data[:keywords]).map(&:to_s).reject(&:blank?)
      lines = []
      lines << "từ khoá: #{clean(keywords.first(6).join(', '))}" if keywords.any?
      reformulated = data["reformulated_query"] || data[:reformulated_query]
      lines << "thử lại: #{clean(reformulated)}" if reformulated.present?
      lines
    end

    def reasoning_lines(data)
      intent = data["intent"] || data[:intent]
      intent.present? ? [ "intent: #{clean(intent)}" ] : []
    end

    def plan_lines(data)
      steps = Array(data["steps"] || data[:steps])
      if steps.any?
        steps.first(6).map do |plan_step|
          title = plan_step["title"] || plan_step[:title] || humanize_action(plan_step["action"] || plan_step[:action])
          "• #{clean(title)}"
        end
      elsif (goal = data["goal"] || data[:goal]).present?
        [ clean(truncate(goal, 80)) ]
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
      action.present? ? [ "→ #{clean(humanize_action(action))}" ] : []
    end

    def llm_lines(data)
      model = data["model"] || data[:model]
      model.present? ? [ clean(model) ] : []
    end

    def answer_lines(data)
      output = data["output"] || data[:output]
      output.present? ? [ "#{output.to_s.length} ký tự" ] : []
    end

    def humanize_action(action)
      ACTION_LABELS.fetch(action.to_s, action.to_s)
    end

    def truncate(text, limit)
      string = text.to_s
      string.length > limit ? "#{string[0, limit]}…" : string
    end

    def clean(text)
      text.to_s.gsub(/[\r\n]+/, " ").strip
    end
  end
end
