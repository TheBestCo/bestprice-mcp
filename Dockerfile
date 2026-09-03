# Glama stdio forwarder for BestPrice MCP
# This Dockerfile provides the intended build spec for Glama inference.
# Glama's admin UI generates its own Dockerfile during the release process.

FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy the stdio forwarder entrypoint
COPY stdio.mjs ./

# Run the local stdio process that forwards to the public BestPrice endpoint
CMD ["node", "stdio.mjs"]
