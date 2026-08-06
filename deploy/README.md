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
