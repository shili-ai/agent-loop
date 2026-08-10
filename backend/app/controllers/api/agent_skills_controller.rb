module Api
  class AgentSkillsController < ApplicationController
    def index
      AgentSkill.default_presales!
      skills = AgentSkill.order(:priority, :name)

      render json: skills.map { |skill| AgentSkillSerializer.new(skill).as_json }
    end
  end
end
