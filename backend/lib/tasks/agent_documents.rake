namespace :agent_documents do
  desc "Index existing AgentDocument records into Elasticsearch"
  task sync_elasticsearch: :environment do
    count = AgentLoop::ElasticsearchDocumentStore.new.sync_all
    puts "Indexed #{count} agent documents into Elasticsearch."
  end
end
