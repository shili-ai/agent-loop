class AgentSkillSerializer
  def initialize(skill, assignment: nil)
    @skill = skill
    @assignment = assignment
  end

  def as_json(*)
    {
      id: @skill.id,
      key: @skill.key,
      name: @skill.name,
      description: @skill.description,
      priority: @assignment&.priority || @skill.priority,
      assignment_id: @assignment&.id,
      enabled: @assignment ? @assignment.enabled : @skill.enabled,
      scope: scope,
      prompts: {
        analysis: @skill.analysis_prompt,
        decider: @skill.decider_prompt,
        answer: @skill.answer_prompt,
        clarification: @skill.clarification_prompt
      }.compact_blank,
      tool_policy: @skill.tool_policy || {}
    }
  end

  private

  def scope
    return "system" unless @assignment
    return "chat" if @assignment.agent_conversation_id.present?
    return "project" if @assignment.agent_project_id.present?

    "custom"
  end
end
