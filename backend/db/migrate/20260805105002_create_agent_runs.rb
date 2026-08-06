class CreateAgentRuns < ActiveRecord::Migration[8.1]
  def change
    create_table :agent_runs do |t|
      t.references :agent_conversation, null: false, foreign_key: true
      t.references :user_message, null: false, foreign_key: { to_table: :agent_messages }
      t.references :assistant_message, foreign_key: { to_table: :agent_messages }
      t.string :status, null: false, default: "running"
      t.text :intent

      t.timestamps
    end
  end
end
