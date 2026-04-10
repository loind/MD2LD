# md2ld — Setup Guide

## Quick Install (any machine)

```bash
# 1. Clone
git clone https://github.com/loind/MD2LD.git
cd MD2LD

# 2. Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# 3. Build binary
bun install
bun run build
# -> dist/md2ld

# 4. Copy to PATH
sudo cp dist/md2ld /usr/local/bin/
```

## Lark App Setup (one-time)

1. Go to https://open.larksuite.com/app → Create App
2. Enable permissions:
   - `docx:document`
   - `docx:document:create`
   - `drive:drive`
   - `drive:file:upload`
3. Copy **App ID** and **App Secret**

## Usage

```bash
# --- Option A: Tenant token (app credentials) ---
md2ld README.md --app-id cli_xxx --app-secret-file ~/.lark-secret --folder fldXXX

# Or set env vars
export LARK_APP_ID=cli_xxx
export LARK_APP_SECRET=xxx
md2ld README.md

# --- Option B: User token (OAuth — broader scopes) ---
md2ld README.md --user-token-file ~/.lark_tokens.json

# Or via env var
export LARK_USER_TOKEN_FILE=~/.lark_tokens.json
md2ld README.md
```

User token takes priority when both are configured.

## Claude Code Integration

### MCP Server (recommended)

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "md2ld": {
      "command": "/usr/local/bin/md2ld-mcp",
      "env": {
        "LARK_APP_ID": "cli_xxx",
        "LARK_APP_SECRET": "xxx",
        "LARK_USER_TOKEN_FILE": "/path/to/.lark_tokens.json",
        "MD2LD_ALLOWED_ROOTS": "/Users/me"
      }
    }
  }
}
```

### Slash Command (alternative)

Copy the slash command to any repo where you want to use it:

```bash
mkdir -p .claude/commands
cp MD2LD/.claude/commands/md2ld.md .claude/commands/
```

Then in Claude Code:
```
/md2ld docs/design.md
```

## Cross-platform Build

```bash
# macOS ARM (M1/M2/M3/M4)
bun build src/index.ts --compile --target bun-darwin-arm64 --outfile dist/md2ld-macos-arm64

# macOS Intel
bun build src/index.ts --compile --target bun-darwin-x64 --outfile dist/md2ld-macos-x64

# Linux x64
bun build src/index.ts --compile --target bun-linux-x64 --outfile dist/md2ld-linux-x64
```
