require "time"

module AgentLoop
  class Runner
    MAX_ITERATIONS = 20

    def self.enqueue(conversation:, content:)
      user_message = conversation.agent_messages.create!(role: "user", content: content)
      run = conversation.agent_runs.create!(user_message: user_message, status: "running")

      Thread.new do
        Rails.application.executor.wrap do
          ActiveRecord::Base.connection_pool.with_connection do
            new(conversation: conversation, content: content, run: run).call
          end
        end
      end

      run
    end

    def initialize(conversation:, content:, run: nil)
      @conversation = conversation
      @content = content
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
        "Đã tải lịch sử hội thoại gần đây và metadata khách hàng.",
        context.merge(output: ContextNoteBuilder.new(context: context).call)
      )

      intent = IntentClassifier.new(message: request_content).call
      run.update!(intent: intent)
      create_step(
        run,
        "reasoning",
        "Phân loại ý định",
        "Đã xác định ý định: #{intent}.",
        { intent: intent, output: IntentNoteBuilder.new(intent: intent, message: request_content).call }
      )

      plan = LoopPlanBuilder.new(intent: intent, message: request_content).call
      create_step(run, "plan", "Lập plan", "Đã tạo plan ngắn cho agent loop.", plan)

      state = {
        documents: [],
        web_results: [],
        artifact: nil,
        artifact_tool: nil,
        clarification: nil,
        search_attempts: 0,
        web_attempts: 0
      }
      loop_result = run_dynamic_loop(run, intent, state, plan, request_content, context)
      tool_result = build_tool_result(state)
      model_answer = loop_result[:action] == "final_answer" ? generate_model_answer(run, intent, tool_result, context, request_content) : nil
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
        "Đã lưu câu trả lời cuối cho giao diện chat.",
        { message_id: assistant_message.id, output: answer }
      )
      create_step(
        run,
        "flow",
        "Vẽ sơ đồ luồng",
        "Đã tạo Mermaid flow từ các bước agent vừa chạy.",
        RunFlowBuilder.new(run: run).call
      )

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

    def maybe_generate_title(assistant_message)
      return unless @conversation.needs_generated_title?
      return unless @conversation.agent_runs.count <= 1

      title = ConversationTitler.new(conversation: @conversation, latest_answer: assistant_message.content).call
      @conversation.update!(title: title) if title.present?
    rescue StandardError => e
      Rails.logger.warn("[AgentLoop::Runner] title generation failed: #{e.class}: #{e.message}")
    end

    def run_dynamic_loop(run, intent, state, plan, message, context)
      MAX_ITERATIONS.times do |index|
        iteration = index + 1
        decision = ModelActionDecider.new(
          intent: intent,
          message: message,
          state: state,
          iteration: iteration,
          max_iterations: MAX_ITERATIONS,
          plan: plan,
          context: context
        ).call
        create_step(
          run,
          "decision",
          "Chọn action tiếp theo",
          "Vòng #{iteration}: #{decision[:source] == 'model' ? 'model' : 'agent'} chọn #{decision[:action]}.",
          decision.merge(iteration: iteration)
        )

        return decision if decision[:action] == "final_answer"

        execute_action(run, intent, state, decision[:action], message)
        return completed_artifact_decision if decision[:action] == "draft_artifact"
        return decision if decision[:action] == "ask_clarification"
      end

      { action: "final_answer", reason: "Đã chạm giới hạn vòng lặp an toàn." }
    end

    def completed_artifact_decision
      {
        action: "final_answer",
        reason: "Bản nháp đã được tạo; chuyển sang tổng hợp câu trả lời cuối.",
        source: "guard"
      }
    end

    def execute_action(run, intent, state, action, message)
      case action
      when "search_documents"
        documents = DummyDocumentSearch.new(query: message).call
        state[:documents] = documents
        state[:search_attempts] = state[:search_attempts].to_i + 1
        create_step(
          run,
          "document_search",
          "Tìm tài liệu",
          "Đã tìm thấy #{documents.count} tài liệu demo liên quan.",
          { tools: ["document_search"], documents: documents, output: DocumentSearchNoteBuilder.new(documents: documents).call }
        )
      when "web_search"
        results = WebSearch.new(query: message).call
        state[:web_results] = results
        state[:web_attempts] = state[:web_attempts].to_i + 1
        create_step(
          run,
          "web_search",
          "Tìm trên web",
          "Đã tìm thấy #{results.count} kết quả web.",
          { tools: ["web_search"], web_results: results, output: WebSearchNoteBuilder.new(results: results).call }
        )
      when "draft_artifact"
        artifact_result = ArtifactBuilder.new(intent: intent, documents: state[:documents]).call
        state[:artifact] = artifact_result[:artifact]
        state[:artifact_tool] = artifact_result[:tool]
        create_step(
          run,
          "artifact",
          "Soạn bản nháp",
          "Đã chuẩn bị #{artifact_result[:artifact][:title]} từ các bằng chứng tìm được.",
          {
            tools: [artifact_result[:tool]],
            artifact: artifact_result[:artifact],
            output: artifact_result[:output]
          }
        )
      when "ask_clarification"
        clarification = ClarificationBuilder.new(message: message).call
        state[:clarification] = clarification
        create_step(
          run,
          "clarification",
          "Hỏi làm rõ",
          "Yêu cầu còn thiếu ngữ cảnh, agent chuẩn bị câu hỏi làm rõ.",
          clarification
        )
      end
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
        artifact: state[:artifact]
      }
    end

    def create_run
      user_message = @conversation.agent_messages.create!(role: "user", content: @content)
      @conversation.agent_runs.create!(user_message: user_message, status: "running")
    end

    def generate_model_answer(run, intent, tool_result, context, request_content)
      generator = ModelAnswerGenerator.new(
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
        "Đang gọi #{generator.client.model} qua Ollama.",
        {
          provider: "ollama",
          model: generator.client.model,
          output: nil,
          status: "running",
          request_started_at: Time.now.utc.iso8601(6)
        }
      )
      result = generator.call_with_metrics
      answer = result[:content]
      step.update!(
        summary: "Đã tạo câu trả lời bằng #{generator.client.model}.",
        data: result[:metrics].merge(output: answer, status: "completed")
      )
      answer
    rescue StandardError => e
      step&.update!(
        title: "Fallback khi model local lỗi",
        summary: "Model local bị lỗi, dùng bộ tổng hợp mặc định.",
        data: { error: e.message, output: nil, status: "failed" }
      )
      nil
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
