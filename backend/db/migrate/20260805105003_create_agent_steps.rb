class CreateAgentSteps < ActiveRecord::Migration[8.1]
  def change
    create_table :agent_steps do |t|
      t.references :agent_run, null: false, foreign_key: true
      t.integer :position, null: false
      t.string :kind, null: false
      t.string :title, null: false
      t.text :summary, null: false
      t.json :data, null: false, default: {}

      t.timestamps
    end

    add_index :agent_steps, [:agent_run_id, :position], unique: true
  end
end
