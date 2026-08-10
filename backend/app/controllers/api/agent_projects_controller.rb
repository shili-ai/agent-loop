module Api
  class AgentProjectsController < ApplicationController
    def index
      ensure_default_project
      projects = AgentProject.order(updated_at: :desc)

      render json: projects.map { |project| serialize(project) }
    end

    def show
      render json: serialize(AgentProject.find(params[:id]))
    end

    def create
      project = AgentProject.create!(project_params)
      assign_default_skill(project)

      render json: serialize(project), status: :created
    end

    def update
      project = AgentProject.find(params[:id])
      project.update!(project_params)

      render json: serialize(project)
    end

    private

    def project_params
      params.require(:agent_project).permit(:title, :industry, :customer_name, :description, :shared_context)
    end

    def serialize(project)
      {
        id: project.id,
        title: project.title,
        industry: project.industry,
        customer_name: project.customer_name,
        description: project.description,
        shared_context: project.shared_context,
        skills: project_skills(project),
        documents: project.agent_documents.order(created_at: :desc).map { |document| AgentDocumentSerializer.new(document).as_json },
        updated_at: project.updated_at
      }
    end

    def project_skills(project)
      assignments = project.agent_skill_assignments.enabled.includes(:agent_skill).order(:priority)
      if assignments.empty?
        [ AgentSkillSerializer.new(AgentSkill.default_presales!).as_json ]
      else
        assignments.map { |assignment| AgentSkillSerializer.new(assignment.agent_skill, assignment: assignment).as_json }
      end
    end

    def ensure_default_project
      return if AgentProject.exists?

      project = AgentProject.create!(
        title: "Presales workspace",
        industry: "Phần mềm",
        description: "Project mặc định cho các đoạn chat presales.",
        shared_context: "Dùng chung context về sản phẩm, khách hàng, tài liệu và nguyên tắc trả lời ở đây."
      )
      assign_default_skill(project)
    end

    def assign_default_skill(project)
      skill = AgentSkill.default_presales!
      project.agent_skill_assignments.find_or_create_by!(agent_skill: skill) do |assignment|
        assignment.priority = skill.priority
        assignment.enabled = true
      end
    end
  end
end
