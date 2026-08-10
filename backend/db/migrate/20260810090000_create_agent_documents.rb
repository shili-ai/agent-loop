class CreateAgentDocuments < ActiveRecord::Migration[8.1]
  def change
    create_table :agent_documents do |t|
      t.references :agent_project, foreign_key: true
      t.references :agent_conversation, foreign_key: true
      t.string :title, null: false
      t.string :filename, null: false
      t.string :content_type
      t.integer :byte_size, null: false, default: 0
      t.text :content, null: false, default: ""
      t.text :summary

      t.timestamps
    end

    add_index :agent_documents, :title
  end
end
