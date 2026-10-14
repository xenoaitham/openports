FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN DB_PATH=:memory: npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/data/openports.db
ENV OPENPORTS_DEMO_MODE=1
ENV PORT=4310
COPY --from=build --chown=node:node /app /app
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4310
CMD ["sh", "-c", "node --import tsx scripts/migrate.ts && exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p \"${PORT:-4310}\""]
