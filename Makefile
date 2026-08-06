export PATH := $(HOME)/.rbenv/shims:$(HOME)/.rbenv/bin:$(PATH)

.PHONY: dev dev-backend dev-frontend

dev:
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) dev-backend & \
	$(MAKE) dev-frontend & \
	wait

dev-backend:
	cd backend && FRONTEND_ORIGIN=http://localhost:3001 ./bin/rails server -p 3000

dev-frontend:
	cd frontend && NEXT_PUBLIC_API_URL=http://localhost:3000 pnpm exec next dev -p 3001
