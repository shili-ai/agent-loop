# syntax=docker/dockerfile:1

FROM node:24-slim

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

EXPOSE 3000
CMD ["bash", "-lc", "pnpm install --frozen-lockfile && pnpm dev --hostname 0.0.0.0"]
