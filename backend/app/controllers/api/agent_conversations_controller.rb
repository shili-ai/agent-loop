module Api
  class AgentConversationsController < ApplicationController
    def index
      conversations = AgentConversation.includes(:agent_runs).order(updated_at: :desc)
      conversations = conversations.where(agent_project_id: params[:agent_project_id]) if params[:agent_project_id].present?
      conversations = conversations.limit(20)

      render json: conversations.map { |conversation| summary(conversation) }
    end

    def show
      conversation = AgentConversation.find(params[:id])
      AgentLoop::Runner.recover_stale_runs!(conversation: conversation)

      render json: AgentConversationSerializer.new(conversation.reload).as_json
    end

    def create
      attributes = conversation_params.to_h
      attributes[:title] = AgentConversation::DEFAULT_TITLE if attributes[:title].blank?
      conversation = AgentConversation.create!(attributes)

      render json: AgentConversationSerializer.new(conversation).as_json, status: :created
    end

    def destroy
      conversation = AgentConversation.find(params[:id])
      conversation.destroy!

      head :no_content
    end

    def cancel
      conversation = AgentConversation.find(params[:id])
      conversation.agent_runs.where(status: "running").find_each do |run|
        run.update!(status: "cancelled")
        run.agent_steps.create!(
          position: run.agent_steps.count + 1,
          kind: "cancelled",
          title: "Đã huỷ",
          summary: "Người dùng đã huỷ lượt chạy này.",
          data: { output: "Người dùng đã huỷ lượt chạy này.", status: "cancelled" }
        )
      end

      render json: AgentConversationSerializer.new(conversation.reload).as_json
    end

    private

    def conversation_params
      params.fetch(:agent_conversation, {}).permit(:title, :industry, :customer_name, :agent_project_id, :instructions)
    end

    def summary(conversation)
      latest_run = latest_run_for(conversation)
      {
        id: conversation.id,
        agent_project_id: conversation.agent_project_id,
        title: conversation.title,
        industry: conversation.industry,
        customer_name: conversation.customer_name,
        instructions: conversation.instructions,
        latest_run_status: latest_run&.status,
        running: latest_run&.status == "running",
        updated_at: conversation.updated_at
      }
    end

    def latest_run_for(conversation)
      if conversation.association(:agent_runs).loaded?
        conversation.agent_runs.max_by(&:created_at)
      else
        conversation.agent_runs.order(created_at: :desc).first
      end
    end
  end
end
