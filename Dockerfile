# Single image, reused for all three processes (web, worker, one-shot
# migrate) via a different CMD per docker-compose service — see
# docker-compose.yml. No Next.js "standalone" output: for a personal,
# single-user deployment the simplicity of one full image that can also run
# scripts/*.ts directly (via tsx) outweighs the smaller image size that
# standalone mode would give only the web process.
FROM node:20-bookworm-slim

WORKDIR /app

# package-lock.json is generated with npm 11; npm 10 (bundled with Node 20)
# resolves bundled/optional wasm deps differently and rejects the lockfile.
# Keep in sync with the "Use npm 11" step in .github/workflows/ci.yml.
RUN npm install -g npm@11

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# DATABASE_URL is read at module load time by lib/server/db.ts (it throws if
# empty), and Next.js's build step imports every route to collect page data
# — so `next build` needs *a* syntactically valid connection string, even
# though nothing actually connects to it during the build. This is a
# placeholder only; the real value is injected at container runtime via
# docker-compose's env_file, which overrides this.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build_placeholder"
RUN npm run build

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && chmod +x docker-entrypoint.sh \
  && mkdir -p storage/documents \
  && chown -R nextjs:nodejs /app

USER nextjs

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
