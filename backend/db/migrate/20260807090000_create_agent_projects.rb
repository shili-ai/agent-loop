class CreateAgentProjects < ActiveRecord::Migration[8.1]
  def change
    create_table :agent_projects do |t|
      t.string :title, null: false
      t.string :industry, null: false, default: "Phần mềm"
      t.string :customer_name
      t.text :description
      t.text :shared_context

      t.timestamps
    end

    add_reference :agent_conversations, :agent_project, foreign_key: true
  end
end
