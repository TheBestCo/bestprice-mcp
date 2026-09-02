# BestPrice Shopping - Cursor Marketplace Submission

## ✅ Ready for Submission

Pull Request: https://github.com/TheBestCo/bestprice-mcp/pull/5

## Repository URL for Marketplace

**Copy this URL to paste into https://cursor.com/marketplace/publish:**

```
https://github.com/TheBestCo/bestprice-mcp
```

## What Was Added

### 1. `.cursor-plugin/plugin.json`
Complete Cursor plugin manifest with:
- Name: `bestprice-shopping`
- Version: `1.1.0`
- Description: Read-only shopping decisions, product search, offer comparison, and price history
- Author: George Papadakis (phaistonian@gmail.com)
- License: Apache-2.0
- Logo: `submission/bestprice-mcp-logo-1024.png`
- MCP Server: References root `mcp.json`

### 2. `.cursor-plugin/skills/SKILL.md`
Agent skill that guides effective use of:
- `get_shopping_decision` - Product recommendations
- `search_products` - Product search
- `compare_offers` - Price & offer comparison
- `get_price_history` - Price trends

### 3. Updated README.md
Added Marketplace installation section with one-click install instructions.

## MCP Server Details

- **Endpoint:** `https://mcp.bestprice.gr/mcp`
- **Type:** Streamable HTTP (remote)
- **Authentication:** None required
- **API Key:** Not needed
- **Scope:** Read-only

## Key Features

✅ Public remote MCP server (no local installation)
✅ No authentication or API keys required
✅ Four read-only tools for Greek product research
✅ Existing logo and branding assets
✅ Apache-2.0 licensed
✅ Complete documentation

## Files Structure

```
.cursor-plugin/
├── plugin.json          # Cursor plugin manifest
├── skills/
│   └── SKILL.md        # Agent usage guide
└── README.md           # Plugin documentation

mcp.json                # MCP server configuration (root)
submission/
└── bestprice-mcp-logo-1024.png  # Logo asset
```

## Next Steps

1. **Merge the PR** (optional, but recommended before submission)
2. **Visit** https://cursor.com/marketplace/publish
3. **Paste repository URL:** `https://github.com/TheBestCo/bestprice-mcp`
4. **Follow** the Cursor Marketplace submission workflow

## Additional Information

- **Homepage:** https://www.bestprice.gr/mcp
- **Documentation:** https://www.bestprice.gr/mcp
- **Privacy Policy:** https://www.bestprice.gr/policies/privacy
- **Terms:** https://www.bestprice.gr/policies/terms
- **Support:** https://www.bestprice.gr/contact

## Validation Completed

✅ Plugin manifest is valid JSON
✅ MCP server configuration is correct
✅ Logo file exists and is properly referenced
✅ All required fields are present
✅ Skill follows Cursor format
✅ No MCP server implementation changes needed
