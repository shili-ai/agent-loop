module Api
  class AgentSkillAssignmentsController < ApplicationController
    def create
      parent = parent_record
      skill = AgentSkill.find(skill_assignment_params[:agent_skill_id])
      assignment = parent.agent_skill_assignments.find_or_initialize_by(agent_skill: skill)
      assignment.update!(
        enabled: skill_assignment_params.fetch(:enabled, true),
        priority: skill_assignment_params[:priority].presence || skill.priority
      )

      render json: AgentSkillSerializer.new(skill, assignment: assignment).as_json, status: :created
    end

    def destroy
      assignment = parent_record.agent_skill_assignments.find(params[:id])
      assignment.destroy!

      head :no_content
    end

    private

    def parent_record
      if params[:agent_project_id].present?
        AgentProject.find(params[:agent_project_id])
      else
        AgentConversation.find(params[:agent_conversation_id])
      end
    end

    def skill_assignment_params
      params.require(:agent_skill_assignment).permit(:agent_skill_id, :priority, :enabled)
    end
  end
end
