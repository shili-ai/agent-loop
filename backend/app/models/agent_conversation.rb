class AgentConversation < ApplicationRecord
  belongs_to :agent_project, optional: true

  has_many :agent_runs, dependent: :destroy
  has_many :agent_messages, dependent: :destroy

  validates :title, presence: true
  validates :industry, presence: true
end
