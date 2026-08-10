class AgentProject < ApplicationRecord
  has_many :agent_conversations, dependent: :nullify
  has_many :agent_documents, dependent: :destroy
  has_many :agent_skill_assignments, dependent: :destroy
  has_many :agent_skills, through: :agent_skill_assignments

  validates :title, presence: true
  validates :industry, presence: true
end
