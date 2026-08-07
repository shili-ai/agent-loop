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
        updated_at: project.updated_at
      }
    end

    def ensure_default_project
      project =
        AgentProject.first ||
        AgentProject.create!(
          title: "Presales workspace",
          industry: "Phần mềm",
          description: "Project mặc định cho các đoạn chat presales.",
          shared_context: "Dùng chung context về sản phẩm, khách hàng, tài liệu và nguyên tắc trả lời ở đây."
        )

      AgentConversation.where(agent_project_id: nil).update_all(agent_project_id: project.id, updated_at: Time.current)
    end
  end
end
