class AgentConversation < ApplicationRecord
  has_many :agent_messages, dependent: :destroy
  has_many :agent_runs, dependent: :destroy

  validates :title, presence: true
  validates :industry, presence: true
end
