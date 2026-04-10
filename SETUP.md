# md2ld — Setup Guide

## Quick Install (any machine)

```bash
# 1. Clone
git clone https://github.com/loind/MD2LD.git
cd MD2LD

# 2. Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# 3. Build binaries
bun install
bun run build
# -> dist/md2ld (CLI) and dist/md2ld-mcp (MCP server)

# 4. Run directly from dist/ (recommended) or copy to PATH
./dist/md2ld doc.md
# Or: sudo cp dist/md2ld dist/md2ld-mcp /usr/local/bin/
```

> **macOS note**: Bun-compiled binaries may be blocked by Gatekeeper when copied to
> `~/.local/bin/` or other non-standard paths (exit code 137 / SIGKILL).
> Run from `dist/` directly or use `/usr/local/bin/` to avoid this.

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
      "command": "/path/to/MD2LD/dist/md2ld-mcp",
      "env": {
        "LARK_APP_ID": "cli_xxx",
        "LARK_APP_SECRET": "xxx",
        "LARK_USER_TOKEN_FILE": "/path/to/.lark_tokens.json",
        "LARK_FOLDER": "fldXXX",
        "LARK_DOMAIN": "mycompany.larksuite.com",
        "MD2LD_ALLOWED_ROOTS": "/Users/me"
      }
    }
  }
}
```

**Environment variables:**

| Variable | Required | Description |
|---|---|---|
| `LARK_APP_ID` | Yes* | Lark app ID (also used for token refresh) |
| `LARK_APP_SECRET` | Yes* | Lark app secret |
| `LARK_USER_TOKEN_FILE` | No | Path to user token JSON (takes priority over tenant token) |
| `LARK_FOLDER` | No | Default folder token for new documents |
| `LARK_DOMAIN` | No | Your Lark domain for document URLs (e.g., `mycompany.larksuite.com`) |
| `MD2LD_ALLOWED_ROOTS` | No | Colon-separated dirs MCP can read from (default: cwd) |
| `MD2LD_DEBUG` | No | Set to `1` for protocol debug logging to `/tmp/md2ld-mcp-protocol.log` |

*Required if `LARK_USER_TOKEN_FILE` is not set. Recommended even with user token (needed for auto-refresh).

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
