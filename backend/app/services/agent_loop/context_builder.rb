module AgentLoop
  class ContextBuilder
    MAX_MESSAGES = 8

    def initialize(conversation:)
      @conversation = conversation
    end

    def call
      {
        conversation: {
          id: @conversation.id,
          title: @conversation.title,
          industry: @conversation.industry,
          customer_name: @conversation.customer_name,
          instructions: @conversation.instructions
        },
        project: project_context,
        skills: skills,
        recent_messages: recent_messages
      }
    end

    private

    def project_context
      project = @conversation.agent_project
      return nil unless project

      {
        id: project.id,
        title: project.title,
        industry: project.industry,
        customer_name: project.customer_name,
        description: project.description,
        shared_context: project.shared_context
      }
    end

    def recent_messages
      @conversation.agent_messages.order(created_at: :desc).limit(MAX_MESSAGES).reverse.map do |message|
        { role: message.role, content: message.content }
      end
    end

    def skills
      SkillResolver.new(conversation: @conversation).call
    end
  end
end
