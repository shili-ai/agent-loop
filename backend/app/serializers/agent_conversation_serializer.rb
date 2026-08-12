class AgentConversationSerializer
  def initialize(conversation)
    @conversation = conversation
  end

  def as_json(*)
    {
      id: @conversation.id,
      agent_project_id: @conversation.agent_project_id,
      title: @conversation.title,
      industry: @conversation.industry,
      customer_name: @conversation.customer_name,
      instructions: @conversation.instructions,
      project: project,
      skills: skills,
      documents: documents,
      messages: messages,
      runs: runs
    }
  end

  private

  def project
    return nil unless @conversation.agent_project

    {
      id: @conversation.agent_project.id,
      title: @conversation.agent_project.title,
      industry: @conversation.agent_project.industry,
      customer_name: @conversation.agent_project.customer_name,
      description: @conversation.agent_project.description,
      shared_context: @conversation.agent_project.shared_context
    }
  end

  def documents
    scoped_documents.map { |document| AgentDocumentSerializer.new(document).as_json }
  end

  def skills
    AgentLoop::SkillResolver.new(conversation: @conversation).call
  end

  def scoped_documents
    AgentDocument.for_conversation_scope(@conversation).order(created_at: :desc)
  end

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
        steps: run.agent_steps.map do |step|
          {
            id: step.id,
            position: step.position,
            kind: step.kind,
            title: step.title,
            summary: step.summary,
            data: step.data,
            created_at: step.created_at,
            updated_at: step.updated_at
          }
        end
      }
    end
  end
end
