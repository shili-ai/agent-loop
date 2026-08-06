class CreateAgentConversations < ActiveRecord::Migration[8.1]
  def change
    create_table :agent_conversations do |t|
      t.string :title, null: false
      t.string :industry, null: false, default: "software"
      t.string :customer_name

      t.timestamps
    end
  end
end
