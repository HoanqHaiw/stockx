# Một image chạy cả API và giao diện (API phục vụ bản build React ở cùng domain).
# Build:  docker build -t justin-stock .
# Chạy:   docker run -p 4000:4000 -e DATABASE_URL=... -e JWT_SECRET=... justin-stock

# ───── Build ─────
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w apps/api \
 && npm run build -w apps/web

# ───── Chạy ─────
FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=4000 \
    WEB_DIST=/app/apps/web/dist

# Giữ node_modules đầy đủ (gồm prisma CLI và tsx) để chạy migrate và seed khi khởi động.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/src ./apps/api/src
COPY --from=build /app/apps/web/dist ./apps/web/dist

USER node
WORKDIR /app/apps/api
EXPOSE 4000
# Áp dụng migration → nạp dữ liệu mẫu nếu CSDL trống → chạy server.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed-if-empty.ts && node dist/server.js"]
