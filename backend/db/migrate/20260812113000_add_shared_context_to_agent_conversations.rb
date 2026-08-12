class AddSharedContextToAgentConversations < ActiveRecord::Migration[8.1]
  def change
    add_column :agent_conversations, :shared_context, :json, null: false, default: {}
  end
end
