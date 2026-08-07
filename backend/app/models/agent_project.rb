class AgentProject < ApplicationRecord
  has_many :agent_conversations, dependent: :nullify

  validates :title, presence: true
  validates :industry, presence: true
end
