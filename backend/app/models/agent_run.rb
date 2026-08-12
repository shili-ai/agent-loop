class AgentRun < ApplicationRecord
  STATUSES = %w[running completed failed cancelled].freeze

  belongs_to :agent_conversation
  belongs_to :user_message, class_name: "AgentMessage"
  belongs_to :assistant_message, class_name: "AgentMessage", optional: true
  has_many :agent_steps, -> { order(:position) }, dependent: :destroy

  validates :status, presence: true, inclusion: { in: STATUSES }
end
