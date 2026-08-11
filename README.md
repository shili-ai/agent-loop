# agent-loop
export PATH="$HOME/.rbenv/bin:$HOME/.rbenv/shims:$PATH"
eval "$(rbenv init - zsh)"
hash -r

## Elasticsearch document search

Elasticsearch is optional. Without `ELASTICSEARCH_URL`, document search keeps using the local DB and Drive fallback.

```sh
export ELASTICSEARCH_URL="http://localhost:9200"
export ELASTICSEARCH_DOCUMENT_INDEX="agent_loop_documents"
```

Run Elasticsearch locally if needed:

```sh
docker run --rm -p 9200:9200 -e discovery.type=single-node -e xpack.security.enabled=false docker.elastic.co/elasticsearch/elasticsearch:8.15.0
```

Or run Elasticsearch + Kibana via compose:

```sh
docker compose -f deploy/docker-compose.dev.yml up -d elasticsearch kibana
```

- Elasticsearch: http://localhost:9200
- Kibana: http://localhost:5601

Index existing uploaded/project/chat documents:

```sh
cd backend
bin/rails agent_documents:sync_elasticsearch
```
