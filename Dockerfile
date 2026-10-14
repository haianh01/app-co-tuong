# Ảnh chạy production: Next.js + server game (WebSocket) trong một tiến trình.
#   docker build -t kydai .
#   docker run -p 3000:3000 -e DATABASE_URL=postgres://... kydai

# Engine cờ tướng mạnh (Pikafish) cho máy cấp Trung bình trở lên và phân tích ván.
FROM debian:bookworm-slim AS engine
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates p7zip-full && rm -rf /var/lib/apt/lists/*
WORKDIR /engine-build
COPY scripts/fetch-engine.sh ./
RUN sh fetch-engine.sh

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx next build && npm prune --omit=dev

FROM node:24-slim AS runtime
WORKDIR /app
ENV PORT=3000
# server.ts chạy bằng tsx nên cần cả mã nguồn TypeScript của phần server.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src ./src
COPY --from=build /app/certs ./certs
COPY --from=build /app/server.ts /app/next.config.ts /app/tsconfig.json ./
COPY --from=engine /engine-build/engine ./engine
# Chỉ dùng khi không đặt DATABASE_URL (PGlite ghi dữ liệu vào đây).
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
