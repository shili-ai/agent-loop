require "time"
require "securerandom"

module AgentLoop
  class Runner
    MAX_ITERATIONS = 20
    class CancelledRunError < StandardError; end

    def self.enqueue(conversation:, content:, model: nil)
      user_message = conversation.agent_messages.create!(role: "user", content: content)
      run = conversation.agent_runs.create!(user_message: user_message, status: "running")

      Thread.new do
        Rails.application.executor.wrap do
          ActiveRecord::Base.connection_pool.with_connection do
            new(conversation: conversation, content: content, model: model, run: run).call
          end
        end
      end

      run
    end

    def initialize(conversation:, content:, model: nil, run: nil)
      @conversation = conversation
      @content = content
      @model = model.to_s.presence
      @run = run
    end

    def call
      run = @run || create_run

      context = ContextBuilder.new(conversation: @conversation).call
      request_content = effective_content(context)
      create_step(
        run,
        "context",
        "Đọc ngữ cảnh chat",
        context_summary(context),
        context.merge(output: ContextNoteBuilder.new(context: context).call)
      )
      check_cancelled!(run)

      analysis = build_model_analysis(run, request_content, context)
      check_cancelled!(run)
      intent = analysis[:intent]
      run.update!(intent: intent)
      create_step(
        run,
        "reasoning",
        analysis[:source] == "model" ? "Phân tích ý định bằng model" : "Phân tích ý định fallback",
        analysis_summary(analysis, request_content),
        analysis.merge(intent_note: IntentNoteBuilder.new(intent: intent, message: request_content).call)
      )

      plan = {
        goal: analysis[:goal],
        actions: analysis[:actions],
        steps: analysis[:steps],
        keywords: analysis[:keywords],
        output: analysis[:output]
      }
      plan_actions = Array(plan[:actions]).map { |action| humanize_action(action) }.join(" → ")
      create_step(
        run,
        "plan",
        analysis[:source] == "model" ? "Lập plan bằng model" : "Lập plan fallback",
        "Mình dự định lần lượt: #{plan_actions}. Mục tiêu: #{plan[:goal]}",
        plan.merge(source: analysis[:source])
      )
      check_cancelled!(run)

      state = {
        documents: [],
        web_results: [],
        web_pages: [],
        artifact: nil,
        artifacts: [],
        artifact_tool: nil,
        clarification: nil,
        working_notes: [],
        search_attempts: 0,
        web_attempts: 0,
        keywords: Array(analysis[:keywords])
      }
      append_working_note(
        state,
        action: "analysis",
        summary: analysis[:understanding],
        intent: intent,
        source: analysis[:source]
      )
      append_working_note(
        state,
        action: "plan",
        summary: "Mục tiêu: #{plan[:goal]}; các bước dự kiến: #{planned_steps_summary(plan)}.",
        planned_actions: Array(plan[:actions]),
        planned_steps: Array(plan[:steps])
      )
      run_broad_retrieval_after_plan(run, state, plan, request_content, context)
      check_cancelled!(run)
      loop_result = run_dynamic_loop(run, intent, state, plan, request_content, context)
      check_cancelled!(run)
      tool_result = build_tool_result(state)
      model_answer = loop_result[:action] == "final_answer" ? generate_model_answer(run, intent, tool_result, context, request_content) : nil
      check_cancelled!(run)
      answer = ResponseComposer.new(
        intent: intent,
        tool_result: tool_result,
        user_message: request_content,
        model_answer: model_answer,
        clarification: state[:clarification]
      ).call
      assistant_message = @conversation.agent_messages.create!(role: "assistant", content: answer)
      maybe_generate_title(assistant_message)
      run.update!(assistant_message: assistant_message, status: "completed")
      create_step(
        run,
        "answer",
        "Tổng hợp câu trả lời",
        "Mình tổng hợp lại ngữ cảnh, tài liệu và bản nháp thành câu trả lời hoàn chỉnh cho bạn.",
        { message_id: assistant_message.id, output: answer }
      )
      create_step(
        run,
        "flow",
        "Vẽ sơ đồ luồng",
        "Đã dựng sơ đồ luồng (nodes/edges) từ các bước agent vừa chạy.",
        RunFlowBuilder.new(run: run).call
      )

      run
    rescue CancelledRunError
      run&.update!(status: "cancelled") if run&.status != "cancelled"
      run
    rescue StandardError => e
      run&.update!(status: "failed")
      create_step(
        run,
        "error",
        "Agent loop bị lỗi",
        "Agent đã dừng trước khi hoàn tất câu trả lời.",
        { error: e.message }
      ) if run
      Rails.logger.error("[AgentLoop::Runner] #{e.class}: #{e.message}")
      nil
    end

    private

    def build_model_analysis(run, request_content, context)
      analyzer = ModelAnalysisBuilder.new(message: request_content, context: context, client: local_model_client)
      initial_summary = "Mình gọi model #{analyzer.client.model} (qua #{analyzer.client.provider_label}) để hiểu yêu cầu, chọn intent và lập plan hành động."
      step = create_step(
        run,
        "llm",
        "Gọi model phân tích",
        initial_summary,
        {
          provider: analyzer.client.provider,
          model: analyzer.client.model,
          prompt_messages: analyzer.prompt_messages,
          prompt_layers: analyzer.prompt_layer_summary,
          output: nil,
          status: "running",
          request_started_at: Time.now.utc.iso8601(6)
        }
      )
      result = analyzer.call_with_metrics
      analysis = result[:analysis]
      duration = format_duration(result.dig(:metrics, :total_duration_ms))
      if analysis[:source] == "model"
        step.update!(
          summary: "#{initial_summary}\nModel #{analyzer.client.model} đã phân tích xong yêu cầu#{duration ? " (mất #{duration})" : ""}.",
          data: result[:metrics].merge(prompt_messages: analyzer.prompt_messages, prompt_layers: analyzer.prompt_layer_summary, output: analysis[:output], raw: result[:raw], status: "completed")
        )
      else
        step.update!(
          title: "Fallback khi model phân tích lỗi",
          summary: "Model phân tích bị lỗi, dùng IntentClassifier và LoopPlanBuilder dự phòng.",
          data: result[:metrics].merge(prompt_messages: analyzer.prompt_messages, prompt_layers: analyzer.prompt_layer_summary, output: analysis[:output], error: analysis[:error], status: "failed")
        )
      end
      analysis
    end

    def maybe_generate_title(assistant_message)
      return unless @conversation.needs_generated_title?
      return unless @conversation.agent_runs.count <= 1

      title = ConversationTitler.new(conversation: @conversation, latest_answer: assistant_message.content, client: local_model_client).call
      @conversation.update!(title: title) if title.present?
    rescue StandardError => e
      Rails.logger.warn("[AgentLoop::Runner] title generation failed: #{e.class}: #{e.message}")
    end

    def run_dynamic_loop(run, intent, state, plan, message, context)
      MAX_ITERATIONS.times do |index|
        check_cancelled!(run)
        iteration = index + 1
        decision = ModelActionDecider.new(
          intent: intent,
          message: message,
          state: state,
          iteration: iteration,
          max_iterations: MAX_ITERATIONS,
          plan: plan,
          context: context,
          client: local_model_client
        ).call
        create_step(
          run,
          "decision",
          "Chọn action tiếp theo",
          decision_summary(decision, iteration),
          decision.merge(iteration: iteration)
        )
        check_cancelled!(run)

        return decision if decision[:action] == "final_answer"

        execute_action(run, intent, state, decision[:action], message, context)
        check_cancelled!(run)
        return decision if decision[:action] == "ask_clarification"
      end

      { action: "final_answer", reason: "Đã chạm giới hạn vòng lặp an toàn." }
    end

    def execute_action(run, intent, state, action, message, context)
      case action
      when "search_documents"
        keywords = retrieval_keywords(state, message)
        documents = DocumentSearch.new(query: message, conversation: @conversation).call
        state[:documents] = documents
        state[:search_attempts] = state[:search_attempts].to_i + 1
        summary =
          if documents.any?
            "Mình tra kho tài liệu nội bộ với từ khoá #{format_keywords(keywords)} — tìm được #{documents.count} tài liệu: #{titles_of(documents)}."
          else
            "Mình tra kho tài liệu nội bộ với từ khoá #{format_keywords(keywords)} nhưng chưa thấy tài liệu nào khớp."
          end
        append_working_note(
          state,
          action: "search_documents",
          summary: documents.any? ? "Tìm được #{documents.count} tài liệu nội bộ: #{titles_of(documents)}." : "Không tìm thấy tài liệu nội bộ phù hợp.",
          evidence_count: documents.count,
          keywords: keywords,
          titles: documents.map { |document| document[:title] }
        )
        create_step(
          run,
          "document_search",
          "Tìm tài liệu",
          summary,
          { tools: [ "document_search" ], query: message, keywords: keywords, documents: documents, output: DocumentSearchNoteBuilder.new(documents: documents).call }
        )
        evaluate_search_results(run, state, message)
      when "web_search"
        keywords = retrieval_keywords(state, message)
        searcher = WebSearch.new(query: message)
        results = searcher.call
        candidates = searcher.candidates
        raw_results = searcher.raw_results
        state[:web_results] = results
        state[:web_attempts] = state[:web_attempts].to_i + 1
        summary =
          if results.any?
            "Mình tra cứu trên web với từ khoá #{format_keywords(keywords)} — nhận về #{results.count} kết quả: #{titles_of(results)}."
          elsif candidates.any?
            "Mình tra cứu web với từ khoá #{format_keywords(keywords)} — thấy #{candidates.count} ứng viên nhưng chưa có kết quả đủ khớp/đáng tin: #{titles_of(candidates)}."
          else
            "Mình tra cứu web với từ khoá #{format_keywords(keywords)} nhưng chưa thấy kết quả phù hợp."
          end
        append_working_note(
          state,
          action: "web_search",
          summary: results.any? ? "Tìm được #{results.count} nguồn web phù hợp: #{titles_of(results)}." : "Không tìm thấy nguồn web phù hợp sau khi lọc nguồn kém/chưa chính thống.",
          evidence_count: results.count,
          candidate_count: candidates.count,
          raw_count: raw_results.count,
          keywords: keywords,
          titles: results.map { |result| result[:title] },
          candidate_titles: candidates.map { |candidate| candidate[:title] }
        )
        create_step(
          run,
          "web_search",
          "Tìm trên web",
          summary,
          {
            tools: [ "web_search" ],
            query: message,
            keywords: keywords,
            web_raw_results: raw_results,
            web_results: results,
            web_candidates: candidates,
            output: WebSearchNoteBuilder.new(results: results, candidates: candidates, raw_results: raw_results).call
          }
        )
        if results.any?
          pages = WebPageReader.new(results: results).call
          readable_pages = pages.select { |page| page[:status] == "read" && page[:content].present? }
          state[:web_pages] = readable_pages
          append_working_note(
            state,
            action: "web_read",
            summary: readable_pages.any? ? "Đã đọc nội dung #{readable_pages.count} trang web đạt chuẩn: #{titles_of(readable_pages)}." : "Có link đạt chuẩn nhưng chưa đọc được nội dung trang.",
            evidence_count: readable_pages.count,
            titles: readable_pages.map { |page| page[:title] }
          )
          create_step(
            run,
            "web_read",
            "Đọc trang web",
            readable_pages.any? ? "Mình đọc nội dung chính của #{readable_pages.count} trang đạt chuẩn để đưa vào brief cho model." : "Mình thử đọc trang đạt chuẩn nhưng chưa trích được nội dung HTML hữu ích.",
            {
              tools: [ "web_page_reader" ],
              pages: pages,
              output: WebPageReadNoteBuilder.new(pages: pages).call
            }
          )
        end
        evaluate_search_results(run, state, message)
      when "draft_artifact"
        artifact_result = ArtifactBuilder.new(intent: intent, documents: state[:documents], message: message).call
        artifact = artifact_result[:artifact].merge(content: artifact_result[:output])
        state[:artifact] = artifact
        state[:artifact_tool] = artifact_result[:tool]
        artifact_entry = add_artifact_entry(state, artifact: artifact, output: artifact_result[:output], tool: artifact_result[:tool], status: "drafted")
        bullets = Array(artifact[:bullets])
        sections = Array(artifact[:sections])
        evidence = state[:documents].to_a.count
        append_working_note(
          state,
          action: "draft_artifact",
          summary: "Đã tạo bản nháp #{artifact[:title]} với #{sections.any? ? "#{sections.count} phần nhỏ" : "#{bullets.count} ý chính"}, dựa trên #{evidence} tài liệu.",
          artifact_id: artifact_entry[:id],
          artifact_title: artifact[:title],
          bullet_count: bullets.count,
          section_count: sections.count,
          evidence_count: evidence
        )
        create_step(
          run,
          "artifact",
          "Soạn bản nháp",
          "Dựa trên #{evidence} tài liệu tìm được, mình phác thảo bản nháp “#{artifact[:title]}”#{sections.any? ? " bằng #{sections.count} phần nhỏ rồi ghép thành file cuối" : (bullets.any? ? " gồm #{bullets.count} ý chính" : "")}.",
          {
            tools: [ artifact_result[:tool] ],
            artifact: artifact,
            artifact_entry: artifact_entry,
            output: artifact_result[:output]
          }
        )
      when "verify_artifact"
        latest = latest_artifact_entry(state)
        verification = ArtifactVerifier.new(artifact: latest&.dig(:artifact) || state[:artifact], message: message).call
        update_latest_artifact(state, status: verification[:status], checks: verification[:checks])
        append_working_note(
          state,
          action: "verify_artifact",
          summary: verification[:summary],
          artifact_title: state[:artifact]&.dig(:title),
          status: verification[:status],
          failed_checks: verification[:checks].select { |check| !check[:passed] }.map { |check| check[:label] }
        )
        create_step(
          run,
          "verification",
          "Kiểm tra bản nháp",
          verification[:summary],
          verification
        )
      when "revise_artifact"
        latest = latest_artifact_entry(state)
        revision = ArtifactReviser.new(
          artifact: latest&.dig(:artifact) || state[:artifact],
          message: message,
          intent: intent,
          documents: state[:documents],
          checks: latest&.dig(:checks) || []
        ).call
        revised_artifact = revision[:artifact].merge(content: revision[:output])
        state[:artifact] = revised_artifact
        state[:artifact_tool] = revision[:tool]
        artifact_entry = add_artifact_entry(state, artifact: revised_artifact, output: revision[:output], tool: revision[:tool], status: "revised")
        append_working_note(
          state,
          action: "revise_artifact",
          summary: revision[:summary],
          artifact_id: artifact_entry[:id],
          artifact_title: revised_artifact[:title]
        )
        create_step(
          run,
          "artifact",
          "Sửa bản nháp",
          revision[:summary],
          {
            tools: [ revision[:tool] ],
            artifact: revised_artifact,
            artifact_entry: artifact_entry,
            output: revision[:output]
          }
        )
      when "ask_clarification"
        clarification = ClarificationBuilder.new(message: message, context: context, client: local_model_client).call
        state[:clarification] = clarification
        question_count = Array(clarification[:questions]).count
        append_working_note(
          state,
          action: "ask_clarification",
          summary: "Đã chuẩn bị #{question_count} câu hỏi làm rõ vì yêu cầu còn thiếu thông tin.",
          question_count: question_count,
          source: clarification[:source]
        )
        create_step(
          run,
          "clarification",
          "Hỏi làm rõ",
          "Yêu cầu còn thiếu thông tin để trả lời chính xác, nên mình chuẩn bị #{question_count} câu hỏi để làm rõ trước khi tiếp tục.",
          clarification
        )
      end
    end

    def run_broad_retrieval_after_plan(run, state, plan, message, context)
      return if ClarificationPolicy.new(message: message, state: state, context: context).required?

      planned_actions = Array(plan[:actions]).map(&:to_s)
      do_documents = planned_actions.include?("search_documents")
      do_web = planned_actions.include?("web_search")
      return unless do_documents || do_web

      keywords = retrieval_keywords(state, message)

      # Chỉ chạy đúng nhánh mà plan yêu cầu; nếu cả hai thì chạy song song.
      document_thread = do_documents ? Thread.new { retrieve_documents(message, keywords) } : nil
      web_thread = do_web ? Thread.new { retrieve_web(message) } : nil

      doc_payload = document_thread ? document_thread.value : { documents: [], reformulated: nil }
      documents = doc_payload[:documents]
      web_payload = web_thread ? web_thread.value : { results: [], candidates: [], raw_results: [] }
      web_results = web_payload[:results]
      web_candidates = web_payload[:candidates]
      web_raw_results = web_payload[:raw_results]
      pages = web_results.any? ? WebPageReader.new(results: web_results).call : []
      readable_pages = pages.select { |page| page[:status] == "read" && page[:content].present? }

      if do_documents
        state[:documents] = documents
        state[:search_attempts] = state[:search_attempts].to_i + 1
      end
      if do_web
        state[:web_results] = web_results
        state[:web_pages] = readable_pages
        state[:web_attempts] = state[:web_attempts].to_i + 1
      end

      append_working_note(
        state,
        action: "retrieval",
        summary: retrieval_note_summary(do_documents, do_web, documents, web_results, readable_pages, doc_payload[:reformulated]),
        evidence_count: documents.count + web_results.count + readable_pages.count,
        keywords: keywords,
        titles: documents.map { |document| document[:title] },
        web_titles: web_results.map { |result| result[:title] },
        web_page_titles: readable_pages.map { |page| page[:title] }
      )
      create_step(
        run,
        "retrieval",
        retrieval_step_title(do_documents, do_web),
        retrieval_step_summary(do_documents, do_web, documents, web_results, readable_pages, keywords, doc_payload[:reformulated]),
        {
          tools: retrieval_tools(do_documents, do_web),
          query: message,
          reformulated_query: doc_payload[:reformulated],
          keywords: keywords,
          documents: documents,
          web_raw_results: web_raw_results,
          web_results: web_results,
          web_candidates: web_candidates,
          pages: pages,
          output: parallel_retrieval_output(documents, web_results, web_candidates, web_raw_results, pages)
        }
      )
      evaluate_search_results(run, state, message)
    end

    # Retry reformulate: nếu tìm bằng cả câu không ra tài liệu, thử lại một lần
    # bằng query rút gọn chỉ gồm keyword.
    def retrieve_documents(message, keywords)
      documents = DocumentSearch.new(query: message, conversation: @conversation).call
      return { documents: documents, reformulated: nil } if documents.any? || keywords.blank?

      reformulated = keywords.join(" ")
      return { documents: documents, reformulated: nil } if reformulated.strip.casecmp?(message.to_s.strip)

      retried = DocumentSearch.new(query: reformulated, conversation: @conversation).call
      { documents: retried, reformulated: retried.any? ? reformulated : nil }
    end

    def retrieve_web(message)
      searcher = WebSearch.new(query: message)
      { results: searcher.call, candidates: searcher.candidates, raw_results: searcher.raw_results }
    end

    def retrieval_tools(do_documents, do_web)
      tools = []
      tools.concat([ "document_search", "drive_document_search" ]) if do_documents
      tools.concat([ "web_search", "web_page_reader" ]) if do_web
      tools
    end

    def retrieval_step_title(do_documents, do_web)
      return "Tìm nguồn đồng thời" if do_documents && do_web
      return "Tìm tài liệu nội bộ" if do_documents

      "Tìm trên web"
    end

    def retrieval_note_summary(do_documents, do_web, documents, web_results, readable_pages, reformulated)
      parts = []
      parts << "tài liệu: #{documents.count}" if do_documents
      parts << "web đạt chuẩn: #{web_results.count}" if do_web
      parts << "trang đọc được: #{readable_pages.count}" if do_web
      retry_note = reformulated ? " (đã thử lại với từ khoá rút gọn “#{reformulated}”)" : ""
      "Đã retrieve theo plan#{retry_note}; #{parts.join(', ')}."
    end

    def retrieval_step_summary(do_documents, do_web, documents, web_results, readable_pages, keywords, reformulated)
      scope =
        if do_documents && do_web
          "trong tài liệu chat/project, Google Drive và trên web"
        elsif do_documents
          "trong tài liệu chat/project và Google Drive"
        else
          "trên web"
        end
      counts = []
      counts << "#{documents.count} tài liệu" if do_documents
      counts << "#{web_results.count} kết quả web đạt chuẩn" if do_web
      counts << "đọc được #{readable_pages.count} trang" if do_web
      retry_note = reformulated ? " Lần đầu không ra tài liệu nên mình thử lại với từ khoá rút gọn “#{reformulated}”." : ""
      "Mình tìm #{scope} với từ khoá #{format_keywords(keywords)} — thấy #{counts.join(', ')}.#{retry_note}"
    end

    def parallel_retrieval_output(documents, web_results, web_candidates, web_raw_results, pages)
      [
        DocumentSearchNoteBuilder.new(documents: documents).call,
        WebSearchNoteBuilder.new(results: web_results, candidates: web_candidates, raw_results: web_raw_results).call,
        WebPageReadNoteBuilder.new(pages: pages).call
      ].join("\n\n")
    end

    def evaluate_search_results(run, state, message)
      documents = Array(state[:documents])
      web_results = Array(state[:web_results])
      web_pages = Array(state[:web_pages])
      return if documents.blank? && web_results.blank? && web_pages.blank?

      evaluation = SearchResultEvaluator.new(
        query: message,
        documents: documents,
        web_results: web_results,
        web_pages: web_pages
      ).call

      state[:documents] = evaluation[:documents]
      state[:web_results] = evaluation[:web_results]
      state[:web_pages] = evaluation[:web_pages]

      accepted_count = evaluation[:documents].count + evaluation[:web_results].count + evaluation[:web_pages].count
      rejected_count = evaluation[:rejected_documents].count + evaluation[:rejected_web_results].count + evaluation[:rejected_web_pages].count
      append_working_note(
        state,
        action: "evaluate_sources",
        summary: "Đã đánh giá độ phù hợp nguồn trước khi tổng hợp; giữ #{accepted_count} nguồn, loại #{rejected_count} nguồn.",
        evidence_count: accepted_count,
        rejected_count: rejected_count,
        document_titles: evaluation[:documents].map { |document| document[:title] },
        web_titles: evaluation[:web_results].map { |result| result[:title] },
        web_page_titles: evaluation[:web_pages].map { |page| page[:title] }
      )
      create_step(
        run,
        "evaluation",
        "Đánh giá nguồn tìm được",
        "Mình kiểm tra độ khớp của tài liệu, link web và trang đã đọc trước khi đưa vào câu trả lời — giữ #{accepted_count} nguồn, loại #{rejected_count} nguồn.",
        source_evaluation_payload(evaluation, message: message, documents: documents, web_results: web_results, web_pages: web_pages)
      )
    end

    def source_evaluation_payload(evaluation, message:, documents:, web_results:, web_pages:)
      {
        query: message,
        before_counts: {
          documents: documents.count,
          web_results: web_results.count,
          web_pages: web_pages.count
        },
        after_counts: {
          documents: evaluation[:documents].count,
          web_results: evaluation[:web_results].count,
          web_pages: evaluation[:web_pages].count
        },
        document_evaluations: compact_evaluations(evaluation[:document_evaluations]),
        web_result_evaluations: compact_evaluations(evaluation[:web_result_evaluations]),
        web_page_evaluations: compact_evaluations(evaluation[:web_page_evaluations]),
        rejected_documents: evaluation[:rejected_documents],
        rejected_web_results: evaluation[:rejected_web_results],
        rejected_web_pages: evaluation[:rejected_web_pages],
        output: evaluation[:output]
      }
    end

    def compact_evaluations(entries)
      Array(entries).map { |entry| entry.except(:item) }
    end

    def build_tool_result(state)
      tools = []
      tools << "document_search" if state[:documents].present?
      tools << "web_search" if state[:web_results].present?
      tools << state[:artifact_tool] if state[:artifact_tool].present?

      {
        tools: tools,
        documents: state[:documents] || [],
        web_results: state[:web_results] || [],
        web_pages: state[:web_pages] || [],
        artifact: state[:artifact],
        artifacts: state[:artifacts] || [],
        working_notes: state[:working_notes] || []
      }
    end

    def add_artifact_entry(state, artifact:, output:, tool:, status:)
      state[:artifacts] ||= []
      entry = {
        id: SecureRandom.uuid,
        title: artifact[:title],
        status: status,
        tool: tool,
        artifact: artifact,
        output: output,
        checks: []
      }
      state[:artifacts] << entry
      entry
    end

    def latest_artifact_entry(state)
      Array(state[:artifacts]).last
    end

    def update_latest_artifact(state, status:, checks:)
      latest = latest_artifact_entry(state)
      return unless latest

      latest[:status] = status
      latest[:checks] = checks
    end

    def create_run
      user_message = @conversation.agent_messages.create!(role: "user", content: @content)
      @conversation.agent_runs.create!(user_message: user_message, status: "running")
    end

    def check_cancelled!(run)
      raise CancelledRunError if run.reload.status == "cancelled"
    end

    def generate_model_answer(run, intent, tool_result, context, request_content)
      generator = ModelAnswerGenerator.new(
        client: local_model_client,
        context: context,
        brief: FinalBriefBuilder.new(
          user_message: request_content,
          intent: intent,
          context: context,
          tool_result: tool_result
        ).call
      )
      step = create_step(
        run,
        "llm",
        "Gọi model local",
        "Mình gọi model #{generator.client.model} (qua #{generator.client.provider_label}) để tự soạn nội dung câu trả lời dựa trên brief đã chuẩn bị.",
        {
          provider: generator.client.provider,
          model: generator.client.model,
          prompt_messages: generator.prompt_messages,
          prompt_layers: generator.prompt_layer_summary,
          output: nil,
          status: "running",
          request_started_at: Time.now.utc.iso8601(6)
        }
      )
      result = generator.call_with_metrics
      answer = result[:content]
      duration = format_duration(result.dig(:metrics, :total_duration_ms))
      step.update!(
        summary: "Model #{generator.client.model} đã soạn xong nội dung câu trả lời#{duration ? " (mất #{duration})" : ""}.",
        data: result[:metrics].merge(prompt_messages: generator.prompt_messages, prompt_layers: generator.prompt_layer_summary, output: answer, status: "completed")
      )
      answer
    rescue StandardError => e
      step&.update!(
        title: "Fallback khi model lỗi",
        summary: "Model local bị lỗi, dùng bộ tổng hợp mặc định.",
        data: { error: e.message, prompt_messages: generator&.prompt_messages, prompt_layers: generator&.prompt_layer_summary, output: nil, status: "failed" }
      )
      nil
    end

    def local_model_client
      @model.present? ? LocalModelClient.new(model: @model) : LocalModelClient.new
    end

    def append_working_note(state, action:, summary:, **metadata)
      note = {
        action: action,
        summary: summary.to_s.squish,
        at: Time.now.utc.iso8601(6)
      }.merge(metadata.compact)
      state[:working_notes] << note
      state[:working_notes] = state[:working_notes].last(12)
    end

    def effective_content(context)
      return @content unless clarification_reply?

      original = previous_user_request(context)
      return @content if original.blank?

      <<~TEXT.squish
        Yêu cầu gốc: #{original}

        Người dùng đã bổ sung ngữ cảnh/trả lời câu hỏi làm rõ: #{@content}
      TEXT
    end

    def clarification_reply?
      @content.to_s.strip.downcase.start_with?("bổ sung ngữ cảnh:")
    end

    def previous_user_request(context)
      recent_messages = context[:recent_messages] || []
      recent_messages.reverse_each do |message|
        next unless message[:role] == "user"

        content = message[:content].to_s
        next if content == @content
        next if content.strip.downcase.start_with?("bổ sung ngữ cảnh:")

        return content
      end
      nil
    end

    def context_summary(context)
      bits = [ "#{Array(context[:recent_messages]).size} tin nhắn gần đây" ]
      customer = context.dig(:conversation, :customer_name)
      industry = context.dig(:conversation, :industry)
      project = context.dig(:project, :title)
      bits << "khách hàng #{customer}" if customer.present?
      bits << "ngành #{industry}" if industry.present?
      bits << "context của project “#{project}”" if project.present?
      "Mình xem lại #{bits.join(", ")} để giữ mạch và trả lời sát ngữ cảnh."
    end

    def analysis_summary(analysis, request_content)
      source = analysis[:source] == "model" ? "model" : "luật dự phòng"
      understanding = analysis[:understanding].to_s.strip
      base = "Sau khi đọc “#{truncate(request_content)}”, #{source} hiểu đây là yêu cầu #{humanize_intent(analysis[:intent])}."
      understanding.present? ? "#{base} #{understanding}" : base
    end

    def decision_summary(decision, iteration)
      action = humanize_action(decision[:action])
      who = decision[:source] == "model" ? "mình" : "agent"
      base = "Ở vòng #{iteration}, #{who} quyết định #{action}"
      reason = decision[:reason].to_s.strip
      reason.present? ? "#{base} vì #{reason.downcase}." : "#{base}."
    end

    def humanize_intent(intent)
      case intent
      when "proposal" then "lập proposal / báo giá"
      when "battlecard" then "làm battlecard"
      when "follow_up" then "soạn email follow-up"
      when "rfp_answer" then "trả lời RFP/RFI"
      when "web_search" then "tra cứu thông tin trên web"
      when "document_search" then "tìm và tóm tắt tài liệu"
      else "tư vấn presales tổng quát"
      end
    end

    def humanize_action(action)
      case action
      when "search_documents" then "tìm tài liệu nội bộ"
      when "web_search" then "tra cứu trên web"
      when "draft_artifact" then "soạn bản nháp"
      when "verify_artifact" then "kiểm tra bản nháp"
      when "revise_artifact" then "sửa bản nháp"
      when "ask_clarification" then "hỏi làm rõ khi thiếu thông tin"
      when "final_answer" then "tổng hợp câu trả lời"
      else action.to_s
      end
    end

    def planned_steps_summary(plan)
      steps = Array(plan[:steps])
      return Array(plan[:actions]).map { |action| humanize_action(action) }.join(" → ") if steps.empty?

      steps.map do |step|
        title = step[:title] || step["title"]
        action = step[:action] || step["action"]
        title.presence || humanize_action(action)
      end.join(" → ")
    end

    # Ưu tiên từ khoá do model đề xuất (cô đọng, đã bỏ từ dừng); chỉ rơi về tách
    # thô khi model không cho keyword nào.
    def retrieval_keywords(state, message)
      Array(state[:keywords]).map(&:to_s).reject(&:blank?).presence || search_keywords(message)
    end

    def search_keywords(message)
      message.to_s.downcase.scan(/[\p{L}\p{N}]+/).select { |word| word.length >= 4 }.uniq.first(6)
    end

    def format_keywords(keywords)
      return "trong yêu cầu" if keywords.blank?

      "“#{keywords.join(", ")}”"
    end

    def titles_of(items, limit = 3)
      names = Array(items).map { |item| item[:title] || item["title"] }.compact
      shown = names.first(limit).join(", ")
      names.length > limit ? "#{shown}…" : shown
    end

    def truncate(text, limit = 140)
      text = text.to_s.strip.gsub(/\s+/, " ")
      text.length > limit ? "#{text[0, limit]}…" : text
    end

    def format_duration(ms)
      value = ms.is_a?(Numeric) ? ms : nil
      return nil unless value

      value < 1000 ? "#{value} ms" : "#{(value / 1000.0).round(1)} s"
    end

    def create_step(run, kind, title, summary, data)
      run.agent_steps.create!(
        position: run.agent_steps.count + 1,
        kind: kind,
        title: title,
        summary: summary,
        data: data
      )
    end
  end
end
