class AddSharedStateToAgentRuns < ActiveRecord::Migration[8.1]
  def change
    add_column :agent_runs, :shared_state, :json, null: false, default: {}
  end
end
