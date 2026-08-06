# syntax=docker/dockerfile:1

FROM node:24-slim

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

EXPOSE 3000
# node_modules là Docker volume (mountpoint) nên pnpm không thể "purge" cả thư mục
# -> tự xoá nội dung bên trong (giữ lại mountpoint) rồi mới install, tránh lỗi
# ERR_PNPM_ABORTED_REMOVE_MODULES_DIR / uv_cwd. Chỉ cài khi thiếu next.
CMD ["bash", "-lc", "[ -x node_modules/.bin/next ] || { find node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null; pnpm install --frozen-lockfile; }; exec pnpm dev --hostname 0.0.0.0"]
