module Api
  class AgentConversationsController < ApplicationController
    def index
      conversations = AgentConversation.order(updated_at: :desc).limit(20)

      render json: conversations.map { |conversation| summary(conversation) }
    end

    def show
      conversation = AgentConversation.find(params[:id])

      render json: AgentConversationSerializer.new(conversation).as_json
    end

    def create
      conversation = AgentConversation.create!(conversation_params)

      render json: AgentConversationSerializer.new(conversation).as_json, status: :created
    end

    def destroy
      conversation = AgentConversation.find(params[:id])
      conversation.destroy!

      head :no_content
    end

    private

    def conversation_params
      params.require(:agent_conversation).permit(:title, :industry, :customer_name)
    end

    def summary(conversation)
      {
        id: conversation.id,
        title: conversation.title,
        industry: conversation.industry,
        customer_name: conversation.customer_name,
        updated_at: conversation.updated_at
      }
    end
  end
end
