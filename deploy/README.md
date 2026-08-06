# Deploy

Chay frontend va backend bang Docker Compose:

```sh
cd deploy
cp .env.example .env
docker compose up --build
```

Mac dinh:

- Frontend: http://localhost:3000
- Backend: http://localhost:3001

Neu port mac dinh dang ban, sua `FRONTEND_PORT` hoac `BACKEND_PORT` trong `.env`.

Rails dung SQLite production va luu database trong Docker volume `backend_storage`.

## Development hot reload

```sh
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env up --build
```

Mac dinh dev:

- Frontend: http://localhost:13000
- Backend: http://localhost:3001

