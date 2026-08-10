class AgentConversation < ApplicationRecord
  DEFAULT_TITLE = "Đoạn chat mới".freeze
  # Titles that should be replaced by a model-generated title after the first reply.
  PLACEHOLDER_TITLES = [DEFAULT_TITLE, "Chat mới", "Chat presales mới"].freeze

  belongs_to :agent_project, optional: true

  has_many :agent_runs, dependent: :destroy
  has_many :agent_messages, dependent: :destroy

  validates :title, presence: true
  validates :industry, presence: true

  def needs_generated_title?
    title.blank? || PLACEHOLDER_TITLES.include?(title.strip)
  end
end
