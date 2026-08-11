module AgentLoop
  class SkillResolver
    def initialize(conversation:)
      @conversation = conversation
    end

    def call
      skills = assigned_skills
      skills = [ default_skill_entry ] if skills.empty?
      skills
    end

    private

    def assigned_skills
      assignments = []
      assignments.concat(project_assignments)
      assignments.concat(conversation_assignments)
      assignments
        .select { |assignment| assignment.agent_skill&.enabled? }
        .sort_by { |assignment| [ assignment.priority, assignment.agent_skill.priority, assignment.agent_skill.key ] }
        .map { |assignment| skill_entry(assignment.agent_skill, assignment.priority, scope_for(assignment)) }
        .uniq { |skill| skill[:key] }
    end

    def project_assignments
      return [] unless @conversation.agent_project

      @conversation.agent_project.agent_skill_assignments.enabled.includes(:agent_skill).to_a
    end

    def conversation_assignments
      @conversation.agent_skill_assignments.enabled.includes(:agent_skill).to_a
    end

    def default_skill_entry
      skill_entry(AgentSkill.default_presales!, 50, "system")
    end

    def skill_entry(skill, assignment_priority, scope)
      {
        id: skill.id,
        key: skill.key,
        name: skill.name,
        description: skill.description,
        priority: assignment_priority,
        scope: scope,
        prompts: {
          analysis: skill.analysis_prompt,
          decider: skill.decider_prompt,
          answer: skill.answer_prompt,
          clarification: skill.clarification_prompt
        }.compact_blank,
        tool_policy: skill.tool_policy || {}
      }
    end

    def scope_for(assignment)
      return "chat" if assignment.agent_conversation_id.present?
      return "project" if assignment.agent_project_id.present?

      "custom"
    end
  end
end
