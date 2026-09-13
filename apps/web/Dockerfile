# ── Ojas Trading Web (Next.js) ─────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app

# Copy every workspace's package.json so npm can resolve the full workspace graph.
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN npm install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/web
# NEXT_PUBLIC_* is inlined into the client bundle at BUILD time, so the API URL
# must be present here (Railway passes the service variable as a build arg).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
# Next's standalone server binds process.env.HOSTNAME, which container runtimes set to
# the container id — that is not reachable from the platform proxy. Force all interfaces.
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
