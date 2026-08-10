class AddInstructionsToAgentConversations < ActiveRecord::Migration[8.1]
  def change
    add_column :agent_conversations, :instructions, :text
  end
end
