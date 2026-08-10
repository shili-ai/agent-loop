class AgentProject < ApplicationRecord
  has_many :agent_conversations, dependent: :nullify
  has_many :agent_documents, dependent: :destroy

  validates :title, presence: true
  validates :industry, presence: true
end
