class AgentConversationSerializer
  def initialize(conversation)
    @conversation = conversation
  end

  def as_json(*)
    {
      id: @conversation.id,
      title: @conversation.title,
      industry: @conversation.industry,
      customer_name: @conversation.customer_name,
      messages: messages,
      runs: runs
    }
  end

  private

  def messages
    @conversation.agent_messages.order(:created_at).map do |message|
      {
        id: message.id,
        role: message.role,
        content: message.content,
        created_at: message.created_at
      }
    end
  end

  def runs
    @conversation.agent_runs.includes(:agent_steps).order(:created_at).map do |run|
      {
        id: run.id,
        status: run.status,
        intent: run.intent,
        user_message_id: run.user_message_id,
        assistant_message_id: run.assistant_message_id,
        steps: run.agent_steps.order(:position).map do |step|
          {
            id: step.id,
            position: step.position,
            kind: step.kind,
            title: step.title,
            summary: step.summary,
            data: step.data
          }
        end
      }
    end
  end
end
