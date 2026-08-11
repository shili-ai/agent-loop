module Api
  class AgentSystemPromptsController < ApplicationController
    def index
      render json: AgentLoop::SystemPromptCatalog.new.call
    end
  end
end
