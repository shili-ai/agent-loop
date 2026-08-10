# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_08_10_100100) do
  create_table "agent_conversations", force: :cascade do |t|
    t.integer "agent_project_id"
    t.datetime "created_at", null: false
    t.string "customer_name"
    t.string "industry", default: "software", null: false
    t.text "instructions"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["agent_project_id"], name: "index_agent_conversations_on_agent_project_id"
  end

  create_table "agent_documents", force: :cascade do |t|
    t.integer "agent_conversation_id"
    t.integer "agent_project_id"
    t.integer "byte_size", default: 0, null: false
    t.text "content", default: "", null: false
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.text "summary"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["agent_conversation_id"], name: "index_agent_documents_on_agent_conversation_id"
    t.index ["agent_project_id"], name: "index_agent_documents_on_agent_project_id"
    t.index ["title"], name: "index_agent_documents_on_title"
  end

  create_table "agent_messages", force: :cascade do |t|
    t.integer "agent_conversation_id", null: false
    t.text "content", null: false
    t.datetime "created_at", null: false
    t.string "role", null: false
    t.datetime "updated_at", null: false
    t.index ["agent_conversation_id"], name: "index_agent_messages_on_agent_conversation_id"
  end

  create_table "agent_projects", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "customer_name"
    t.text "description"
    t.string "industry", default: "Phần mềm", null: false
    t.text "shared_context"
    t.string "title", null: false
    t.datetime "updated_at", null: false
  end

  create_table "agent_runs", force: :cascade do |t|
    t.integer "agent_conversation_id", null: false
    t.integer "assistant_message_id"
    t.datetime "created_at", null: false
    t.text "intent"
    t.string "status", default: "running", null: false
    t.datetime "updated_at", null: false
    t.integer "user_message_id", null: false
    t.index ["agent_conversation_id"], name: "index_agent_runs_on_agent_conversation_id"
    t.index ["assistant_message_id"], name: "index_agent_runs_on_assistant_message_id"
    t.index ["user_message_id"], name: "index_agent_runs_on_user_message_id"
  end

  create_table "agent_skill_assignments", force: :cascade do |t|
    t.integer "agent_conversation_id"
    t.integer "agent_project_id"
    t.integer "agent_skill_id", null: false
    t.datetime "created_at", null: false
    t.boolean "enabled", default: true, null: false
    t.integer "priority", default: 50, null: false
    t.datetime "updated_at", null: false
    t.index ["agent_conversation_id"], name: "index_agent_skill_assignments_on_agent_conversation_id"
    t.index ["agent_project_id"], name: "index_agent_skill_assignments_on_agent_project_id"
    t.index ["agent_skill_id", "agent_project_id", "agent_conversation_id"], name: "idx_agent_skill_assignments_scope", unique: true
    t.index ["agent_skill_id"], name: "index_agent_skill_assignments_on_agent_skill_id"
  end

  create_table "agent_skills", force: :cascade do |t|
    t.text "analysis_prompt"
    t.text "answer_prompt"
    t.text "clarification_prompt"
    t.datetime "created_at", null: false
    t.text "decider_prompt"
    t.text "description"
    t.boolean "enabled", default: true, null: false
    t.string "key", null: false
    t.string "name", null: false
    t.integer "priority", default: 50, null: false
    t.json "tool_policy", default: {}, null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_agent_skills_on_key", unique: true
  end

  create_table "agent_steps", force: :cascade do |t|
    t.integer "agent_run_id", null: false
    t.datetime "created_at", null: false
    t.json "data", default: {}, null: false
    t.string "kind", null: false
    t.integer "position", null: false
    t.text "summary", null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["agent_run_id", "position"], name: "index_agent_steps_on_agent_run_id_and_position", unique: true
    t.index ["agent_run_id"], name: "index_agent_steps_on_agent_run_id"
  end

  add_foreign_key "agent_conversations", "agent_projects"
  add_foreign_key "agent_documents", "agent_conversations"
  add_foreign_key "agent_documents", "agent_projects"
  add_foreign_key "agent_messages", "agent_conversations"
  add_foreign_key "agent_runs", "agent_conversations"
  add_foreign_key "agent_runs", "agent_messages", column: "assistant_message_id"
  add_foreign_key "agent_runs", "agent_messages", column: "user_message_id"
  add_foreign_key "agent_skill_assignments", "agent_conversations"
  add_foreign_key "agent_skill_assignments", "agent_projects"
  add_foreign_key "agent_skill_assignments", "agent_skills"
  add_foreign_key "agent_steps", "agent_runs"
end
