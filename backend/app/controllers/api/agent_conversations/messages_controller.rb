module Api
  module AgentConversations
    class MessagesController < ApplicationController
      def create
        conversation = AgentConversation.find(params[:agent_conversation_id])
        AgentLoop::Runner.new(conversation: conversation, content: message_params[:content]).call

        render json: AgentConversationSerializer.new(conversation.reload).as_json, status: :created
      end

      private

      def message_params
        params.require(:message).permit(:content)
      end
    end
  end
end
