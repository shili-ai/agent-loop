module Api
  class AgentSkillsController < ApplicationController
    def index
      AgentSkill.default_presales!
      skills = AgentSkill.order(:priority, :name)

      render json: skills.map { |skill| AgentSkillSerializer.new(skill).as_json }
    end

    def create
      skill = AgentSkill.create!(skill_params)

      render json: AgentSkillSerializer.new(skill).as_json, status: :created
    end

    def update
      skill = AgentSkill.find(params[:id])
      skill.update!(skill_params)

      render json: AgentSkillSerializer.new(skill).as_json
    end

    private

    def skill_params
      params.require(:agent_skill).permit(
        :key,
        :name,
        :description,
        :analysis_prompt,
        :decider_prompt,
        :answer_prompt,
        :clarification_prompt,
        :priority,
        :enabled,
        tool_policy: {}
      )
    end
  end
end
