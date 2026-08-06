class AgentStep < ApplicationRecord
  belongs_to :agent_run

  validates :position, presence: true
  validates :kind, presence: true
  validates :title, presence: true
  validates :summary, presence: true
end
