module Api
  class AgentDocumentsController < ApplicationController
    def create
      parent = parent_record
      file = params.require(:file)
      content = AgentLoop::DocumentTextExtractor.new(file: file).call
      document = parent.agent_documents.create!(
        title: params[:title].presence || File.basename(file.original_filename.to_s, ".*"),
        filename: file.original_filename.to_s,
        content_type: file.content_type,
        byte_size: file.size,
        content: content,
        summary: summary_for(content)
      )
      AgentLoop::ElasticsearchDocumentStore.new.index_document(document)

      render json: AgentDocumentSerializer.new(document).as_json, status: :created
    end

    def destroy
      document = parent_record.agent_documents.find(params[:id])
      AgentLoop::ElasticsearchDocumentStore.new.delete_document(document.id)
      document.destroy!

      head :no_content
    end

    private

    def parent_record
      if params[:agent_project_id].present?
        AgentProject.find(params[:agent_project_id])
      else
        AgentConversation.find(params[:agent_conversation_id])
      end
    end

    def summary_for(content)
      return "Chưa trích được text từ file này." if content.blank?

      content.to_s.squish.first(280)
    end
  end
end
