class CreateAgentMessages < ActiveRecord::Migration[8.1]
  def change
    create_table :agent_messages do |t|
      t.references :agent_conversation, null: false, foreign_key: true
      t.string :role, null: false
      t.text :content, null: false

      t.timestamps
    end
  end
end
