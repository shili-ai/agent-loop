class CreateAgentSkills < ActiveRecord::Migration[8.1]
  def change
    create_table :agent_skills do |t|
      t.string :key, null: false
      t.string :name, null: false
      t.text :description
      t.text :analysis_prompt
      t.text :decider_prompt
      t.text :answer_prompt
      t.text :clarification_prompt
      t.json :tool_policy, default: {}, null: false
      t.integer :priority, default: 50, null: false
      t.boolean :enabled, default: true, null: false

      t.timestamps
    end

    add_index :agent_skills, :key, unique: true

    create_table :agent_skill_assignments do |t|
      t.references :agent_skill, null: false, foreign_key: true
      t.references :agent_project, foreign_key: true
      t.references :agent_conversation, foreign_key: true
      t.integer :priority, default: 50, null: false
      t.boolean :enabled, default: true, null: false

      t.timestamps
    end

    add_index :agent_skill_assignments,
              [ :agent_skill_id, :agent_project_id, :agent_conversation_id ],
              unique: true,
              name: "idx_agent_skill_assignments_scope"
  end
end
