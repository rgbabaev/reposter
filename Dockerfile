# syntax=docker/dockerfile:1
FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY shared/package.json shared/package.json
# Optional CA mount supports managed proxies without changing normal builds.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --strict-ssl=true --no-audit --no-fund; \
    else npm ci --strict-ssl=true --no-audit --no-fund; fi
COPY . .
RUN npm run build
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm prune --omit=dev --ignore-scripts --no-audit --no-fund; \
    else npm prune --omit=dev --ignore-scripts --no-audit --no-fund; fi

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production MONITOR_CONFIG=/config/config.json
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/migrations ./server/migrations
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/client/package.json ./client/package.json
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /data/telegram /config && chown -R node:node /data /config && chmod 700 /data /data/telegram /config
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "-e", "const fs=require('node:fs'); const c=JSON.parse(fs.readFileSync(process.env.MONITOR_CONFIG,'utf8')); const h=c.bind==='::1'?'[::1]':'127.0.0.1'; fetch('http://'+h+':'+c.port+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server/dist/index.js"]
