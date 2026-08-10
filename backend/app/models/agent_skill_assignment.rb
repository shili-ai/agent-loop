class AgentSkillAssignment < ApplicationRecord
  belongs_to :agent_skill
  belongs_to :agent_project, optional: true
  belongs_to :agent_conversation, optional: true

  validates :priority, numericality: { only_integer: true }
  validate :has_scope

  scope :enabled, -> { where(enabled: true) }

  private

  def has_scope
    return if agent_project_id.present? || agent_conversation_id.present?

    errors.add(:base, "Skill assignment must belong to a project or conversation")
  end
end
