# Local stdio entry point for the BestPrice MCP server.
# Forwards MCP over stdin/stdout to the public Streamable HTTP endpoint (see src/bridge.js).
# Glama builds from this file; BESTPRICE_MCP_URL and BESTPRICE_MCP_TIMEOUT_MS are optional overrides.

FROM node:22.23.2-alpine

LABEL org.opencontainers.image.title="BestPrice MCP stdio bridge" \
      org.opencontainers.image.source="https://github.com/TheBestCo/bestprice-mcp" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="BestPrice"

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY stdio.mjs ./
COPY src ./src

USER node

CMD ["node", "stdio.mjs"]
