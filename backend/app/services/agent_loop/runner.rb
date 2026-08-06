module AgentLoop
  class Runner
    MAX_ITERATIONS = 8

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
      create_step(
        run,
        "context",
        "Đọc ngữ cảnh chat",
        "Đã tải lịch sử hội thoại gần đây và metadata khách hàng.",
        context.merge(output: ContextNoteBuilder.new(context: context).call)
      )

      intent = IntentClassifier.new(message: @content).call
      run.update!(intent: intent)
      create_step(
        run,
        "reasoning",
        "Phân loại ý định",
        "Đã xác định ý định: #{intent}.",
        { intent: intent, output: IntentNoteBuilder.new(intent: intent, message: @content).call }
      )

      plan = LoopPlanBuilder.new(intent: intent, message: @content).call
      create_step(run, "plan", "Lập plan", "Đã tạo plan ngắn cho agent loop.", plan)

      state = { documents: [], artifact: nil, artifact_tool: nil, clarification: nil }
      loop_result = run_dynamic_loop(run, intent, context, state)
      tool_result = build_tool_result(state)
      model_answer = loop_result[:action] == "final_answer" ? generate_model_answer(run, intent, tool_result, context) : nil
      answer = ResponseComposer.new(
        intent: intent,
        tool_result: tool_result,
        user_message: @content,
        model_answer: model_answer,
        clarification: state[:clarification]
      ).call
      assistant_message = @conversation.agent_messages.create!(role: "assistant", content: answer)
      run.update!(assistant_message: assistant_message, status: "completed")
      create_step(
        run,
        "answer",
        "Tổng hợp câu trả lời",
        "Đã lưu câu trả lời cuối cho giao diện chat.",
        { message_id: assistant_message.id, output: answer }
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

    def run_dynamic_loop(run, intent, context, state)
      MAX_ITERATIONS.times do |index|
        iteration = index + 1
        decision = ActionDecider.new(
          intent: intent,
          message: @content,
          state: state,
          iteration: iteration,
          max_iterations: MAX_ITERATIONS
        ).call
        create_step(
          run,
          "decision",
          "Chọn action tiếp theo",
          "Vòng #{iteration}: agent chọn #{decision[:action]}.",
          decision
        )

        execute_action(run, intent, state, decision[:action])
        return decision if decision[:action] == "final_answer"

        evaluation = LoopEvaluator.new(intent: intent, state: state, last_action: decision[:action]).call
        create_step(
          run,
          "evaluation",
          "Đánh giá tiến độ",
          evaluation[:reason],
          evaluation.merge(last_action: decision[:action])
        )
        if evaluation[:done]
          final_action = decision[:action] == "ask_clarification" ? "ask_clarification" : "final_answer"
          return { action: final_action, reason: evaluation[:reason] }
        end
      end

      { action: "final_answer", reason: "Đã chạm giới hạn vòng lặp an toàn." }
    end

    def execute_action(run, intent, state, action)
      case action
      when "search_documents"
        documents = DummyDocumentSearch.new(query: @content).call
        state[:documents] = documents
        create_step(
          run,
          "document_search",
          "Tìm tài liệu",
          "Đã tìm thấy #{documents.count} tài liệu demo liên quan.",
          { tools: ["document_search"], documents: documents, output: DocumentSearchNoteBuilder.new(documents: documents).call }
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
        clarification = ClarificationBuilder.new(message: @content).call
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
      tools << state[:artifact_tool] if state[:artifact_tool].present?

      {
        tools: tools,
        documents: state[:documents] || [],
        artifact: state[:artifact]
      }
    end

    def create_run
      user_message = @conversation.agent_messages.create!(role: "user", content: @content)
      @conversation.agent_runs.create!(user_message: user_message, status: "running")
    end

    def generate_model_answer(run, intent, tool_result, context)
      generator = ModelAnswerGenerator.new(
        brief: FinalBriefBuilder.new(
          user_message: @content,
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
        { provider: "ollama", model: generator.client.model, output: nil, status: "running" }
      )
      answer = generator.call
      step.update!(
        summary: "Đã tạo câu trả lời bằng #{generator.client.model}.",
        data: { provider: "ollama", model: generator.client.model, output: answer, status: "completed" }
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
