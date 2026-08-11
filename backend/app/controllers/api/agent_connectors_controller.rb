module Api
  class AgentConnectorsController < ApplicationController
    def index
      render json: AgentLoop::AgentConnectorRegistry.all
    end

    def show
      render json: AgentLoop::AgentConnectorRegistry.find(params[:key])
    end

    def update
      render json: AgentLoop::AgentConnectorRegistry.update(params[:key], connector_params)
    end

    def test
      render json: AgentLoop::AgentConnectorRegistry.test(params[:key])
    end

    private

    def connector_params
      params.require(:agent_connector).permit(:enabled, :index_path)
    end
  end
end
