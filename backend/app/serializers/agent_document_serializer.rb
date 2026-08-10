class AgentDocumentSerializer
  def initialize(document)
    @document = document
  end

  def as_json(*)
    {
      id: @document.id,
      agent_project_id: @document.agent_project_id,
      agent_conversation_id: @document.agent_conversation_id,
      title: @document.title,
      filename: @document.filename,
      content_type: @document.content_type,
      byte_size: @document.byte_size,
      summary: @document.summary,
      content_preview: @document.content.to_s.first(1_200),
      extracted: @document.content.present?,
      created_at: @document.created_at
    }
  end
end
