module Api
  module AgentConversations
    class MessagesController < ApplicationController
      def create
        conversation = AgentConversation.find(params[:agent_conversation_id])
        AgentLoop::Runner.enqueue(conversation: conversation, content: message_params[:content], model: message_params[:model])

        render json: AgentConversationSerializer.new(conversation.reload).as_json, status: :accepted
      end

      private

      def message_params
        params.require(:message).permit(:content, :model)
      end
    end
  end
end
