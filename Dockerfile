# Glama stdio proxy for BestPrice MCP
# This Dockerfile provides the intended build spec for Glama inference.
# Glama's admin UI generates its own Dockerfile during the release process.

FROM node:22-alpine

# The stdio proxy forwards MCP requests to the public BestPrice endpoint
CMD ["npx", "-y", "mcp-remote", "https://mcp.bestprice.gr/mcp"]
