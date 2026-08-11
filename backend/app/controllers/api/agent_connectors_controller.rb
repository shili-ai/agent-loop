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

    def connect
      ensure_google_drive!

      render json: { auth_url: AgentLoop::GoogleDriveConnector.auth_url }
    rescue StandardError => e
      render json: { error: e.message }, status: :unprocessable_content
    end

    def callback
      AgentLoop::GoogleDriveConnector.exchange_code!(code: params[:code], state: params[:state])
      redirect_to "#{AgentLoop::GoogleDriveConnector.frontend_url}?connector=google_drive&connected=1", allow_other_host: true
    rescue StandardError => e
      redirect_to "#{AgentLoop::GoogleDriveConnector.frontend_url}?connector=google_drive&error=#{ERB::Util.url_encode(e.message)}", allow_other_host: true
    end

    def disconnect
      ensure_google_drive!

      render json: AgentLoop::GoogleDriveConnector.disconnect!
    end

    private

    def connector_params
      params.require(:agent_connector).permit(:enabled)
    end

    def ensure_google_drive!
      raise ActionController::RoutingError, "Unknown connector" unless params[:key] == AgentLoop::AgentConnectorRegistry::GOOGLE_DRIVE_KEY
    end
  end
end
