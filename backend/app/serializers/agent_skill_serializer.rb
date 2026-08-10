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
      enabled: @assignment ? @assignment.enabled : @skill.enabled
    }
  end
end
