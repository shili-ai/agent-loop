class AgentMessage < ApplicationRecord
  ROLES = %w[user assistant system].freeze

  belongs_to :agent_conversation, touch: true

  validates :role, presence: true, inclusion: { in: ROLES }
  validates :content, presence: true
end
