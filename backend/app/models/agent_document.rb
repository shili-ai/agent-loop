class AgentDocument < ApplicationRecord
  belongs_to :agent_project, optional: true
  belongs_to :agent_conversation, optional: true

  validates :title, presence: true
  validates :filename, presence: true
  validates :byte_size, numericality: { greater_than_or_equal_to: 0 }
  validate :has_scope

  scope :for_conversation_scope, lambda { |conversation|
    scoped = where(agent_conversation_id: conversation.id)
    next scoped if conversation.agent_project_id.blank?

    scoped.or(where(agent_project_id: conversation.agent_project_id))
  }

  private

  def has_scope
    return if agent_project_id.present? || agent_conversation_id.present?

    errors.add(:base, "Document must belong to a project or conversation")
  end
end
