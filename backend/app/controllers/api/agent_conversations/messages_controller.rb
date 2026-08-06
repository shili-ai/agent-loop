module Api
  module AgentConversations
    class MessagesController < ApplicationController
      def create
        conversation = AgentConversation.find(params[:agent_conversation_id])
        AgentLoop::Runner.enqueue(conversation: conversation, content: message_params[:content])

        render json: AgentConversationSerializer.new(conversation.reload).as_json, status: :accepted
      end

      private

      def message_params
        params.require(:message).permit(:content)
      end
    end
  end
end
