# md2ld

Markdown to Lark Docs. Single binary, zero config.

```bash
md2ld README.md --app-id cli_xxx --app-secret xxx
# -> Created: docx/AbCdEf (set LARK_DOMAIN for full URL)
```

## Features

- **Full Markdown support** -- headings, lists, tables, code blocks (72+ languages), blockquotes, dividers, inline styles (bold, italic, strikethrough, inline code, links)
- **Image upload** -- local files and remote URLs are uploaded to Lark automatically
- **Diagram rendering** -- Mermaid, PlantUML, Graphviz code fences are rendered to PNG via Kroki.io and embedded as images
- **Auto title** -- first H1 becomes the document title
- **Single binary** -- compiles to one executable via Bun, no runtime needed
- **Dual auth** -- supports both tenant_access_token and user_access_token (OAuth), with auto-refresh
- **MCP server** -- built-in MCP server for Claude Desktop and Claude Code
- **Claude Code integration** -- ships with a `/md2ld` slash command

## Install

```bash
git clone https://github.com/loind/MD2LD.git
cd MD2LD
curl -fsSL https://bun.sh/install | bash   # skip if Bun installed
bun install && bun run build
# -> dist/md2ld (CLI) and dist/md2ld-mcp (MCP server)
```

Run directly from `dist/` or copy to PATH:

```bash
# Option A: Run from project directory (recommended — avoids macOS Gatekeeper issues)
./dist/md2ld doc.md

# Option B: Copy to PATH (may require clearing quarantine on macOS)
sudo cp dist/md2ld dist/md2ld-mcp /usr/local/bin/
```

## Lark App Setup

1. Create app at [open.larksuite.com/app](https://open.larksuite.com/app)
2. Enable permissions: `docx:document`, `docx:document:create`, `drive:drive`, `drive:file:upload`
3. Grab **App ID** and **App Secret**

## Authentication

md2ld supports two authentication methods:

| Method | Token type | Scopes | Use case |
|---|---|---|---|
| **App credentials** | `tenant_access_token` | Limited to tenant-level scopes | Simple automation, no user context |
| **User token file** | `user_access_token` | Full user-level scopes (docx, drive, etc.) | When tenant scopes are insufficient |

**Priority**: user token file > tenant token. If both are configured, user token is used.

User tokens are automatically refreshed via the OAuth refresh_token API when app credentials are also provided.

## Usage

```bash
# --- Tenant token (app credentials) ---

# Flags (secret read from file, not CLI arg — safe from `ps`)
echo "xxx" > ~/.lark-secret
md2ld doc.md --app-id cli_xxx --app-secret-file ~/.lark-secret --folder fldXXX

# Environment variables
export LARK_APP_ID=cli_xxx
export LARK_APP_SECRET=xxx
md2ld doc.md

# Config file (~/.md2ld.env)
echo "LARK_APP_ID=cli_xxx" >> ~/.md2ld.env
echo "LARK_APP_SECRET=xxx" >> ~/.md2ld.env
md2ld doc.md

# --- User token (OAuth) ---

# User token file (JSON with access_token + refresh_token)
md2ld doc.md --user-token-file ~/.lark_tokens.json

# Or via env var
export LARK_USER_TOKEN_FILE=~/.lark_tokens.json
md2ld doc.md
```

Credential priority: `--user-token-file` > `--app-id`/`--app-secret-file` flags > env vars > config files.

### User Token File Format

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "access_token_expires_at": 1775808406.809,
  "refresh_token_expires_at": 1776406006.809
}
```

### Options

| Flag | Description |
|---|---|
| `--app-id <id>` | Lark app ID |
| `--app-secret-file <path>` | File containing Lark app secret |
| `--user-token-file <path>` | JSON file with user_access_token (or env `LARK_USER_TOKEN_FILE`) |
| `--folder <token>` | Target folder (or `LARK_FOLDER` env) |
| `--title <string>` | Override doc title (default: first H1) |
| `--append <doc-id>` | Append to existing doc |
| `--no-diagrams` | Keep diagrams as code blocks |
| `--dry-run` | Print Lark Block JSON, skip API calls |

### Environment Variables

| Variable | Description |
|---|---|
| `LARK_APP_ID` | Lark app ID |
| `LARK_APP_SECRET` | Lark app secret |
| `LARK_USER_TOKEN_FILE` | Path to user token JSON file |
| `LARK_FOLDER` | Default folder token |
| `LARK_DOMAIN` | Your Lark domain (e.g., `mycompany.larksuite.com`) for document URLs |
| `MD2LD_DEBUG` | Set to `1` to enable MCP protocol debug logging to `/tmp/md2ld-mcp-protocol.log` |

### Dry run

Preview the generated Lark blocks without calling any API:

```bash
md2ld doc.md --dry-run | jq .
```

## MCP Server (Claude Desktop / Claude Code)

md2ld ships with a built-in MCP server (`dist/md2ld-mcp`). This lets Claude call md2ld as a tool directly.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "md2ld": {
      "command": "/path/to/MD2LD/dist/md2ld-mcp",
      "env": {
        "LARK_APP_ID": "cli_xxx",
        "LARK_APP_SECRET": "xxx",
        "LARK_FOLDER": "fldXXX",
        "MD2LD_ALLOWED_ROOTS": "/Users/me/projects:/Users/me/docs"
      }
    }
  }
}
```

### Claude Code

Add to `~/.claude.json` (the `mcpServers` key):

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
        "MD2LD_ALLOWED_ROOTS": "/Users/me/projects:/Users/me/docs"
      }
    }
  }
}
```

> **Note**: MCP servers must be configured in `~/.claude.json`, not `~/.claude/settings.json`.
> 
> **macOS**: Use the binary directly from `dist/` to avoid Gatekeeper blocking execution from `~/.local/bin/` or other non-standard paths.

### Security

| Protection | Detail |
|---|---|
| File access | MCP server only reads `.md` files within `MD2LD_ALLOWED_ROOTS` (default: cwd) |
| Credentials | Only from env vars — never accepted as tool params, never in conversation history |
| Auth tokens | User tokens read from file, auto-refreshed, never exposed to MCP callers |
| SSRF | Image URLs validated: HTTPS/HTTP only, private/internal IPs blocked |
| Path traversal | Image paths validated to stay within the markdown file's directory |
| Error messages | Sanitized — no internal file paths leaked to MCP callers |

After configuring, Claude can use two tools:

| Tool | Description |
|---|---|
| `md2ld` | Push a file or raw Markdown to Lark Docs, returns the doc URL |
| `md2ld_preview` | Dry run -- returns the Lark Block JSON without creating a doc |

### MAIO Multi-Agent Integration

Khi dùng md2ld với MAIO (Multi-Agent Intelligence Orchestrator), mỗi agent có token riêng tại `~/.maio/agents/{agent_id}/.lark_tokens.json`.

**Config `~/.claude.json` cho agent cụ thể:**

```json
{
  "md2ld": {
    "command": "/path/to/MD2LD/dist/md2ld-mcp",
    "env": {
      "LARK_APP_ID": "cli_xxx",
      "LARK_APP_SECRET": "xxx",
      "LARK_USER_TOKEN_FILE": "~/.maio/agents/agent_prd/.lark_tokens.json"
    }
  }
}
```

**TODO: Tính năng cần phát triển cho MAIO:**

- [ ] Nhận `MAIO_AGENT_ID` từ env → tự resolve token path: `~/.maio/agents/{agent_id}/.lark_tokens.json`
- [ ] Fallback: nếu không có `MAIO_AGENT_ID` → dùng `LARK_USER_TOKEN_FILE` như cũ
- [ ] Auto-discover: scan `~/.maio/agents/*/` tìm agent có token hợp lệ khi không specify

### Install MCP binary

```bash
bun run build                          # builds both dist/md2ld and dist/md2ld-mcp
# Use dist/md2ld-mcp directly in your MCP config (recommended)
# Or copy to /usr/local/bin/ if preferred:
sudo cp dist/md2ld-mcp /usr/local/bin/
```

### Slash Command (alternative)

If you prefer slash commands over MCP, copy into any repo:

```bash
mkdir -p .claude/commands
cp .claude/commands/md2ld.md <your-repo>/.claude/commands/
```

Then: `/md2ld docs/design.md`

## Cross-platform Build

```bash
bun build src/index.ts --compile --target bun-darwin-arm64 --outfile dist/md2ld-macos-arm64
bun build src/index.ts --compile --target bun-darwin-x64   --outfile dist/md2ld-macos-x64
bun build src/index.ts --compile --target bun-linux-x64    --outfile dist/md2ld-linux-x64
```

## Project Structure

```
src/
  index.ts                 CLI entry point
  mcp-server.ts            MCP server (JSON-RPC over stdio)
  converter/
    md-to-blocks.ts        Markdown -> Lark Block JSON
    types.ts               Block types, language map
    image-upload.ts         Fetch/read image -> upload to Lark
    diagrams.ts            Mermaid/PlantUML -> PNG via Kroki
  lark/
    auth.ts                Dual auth (tenant + user token), auto refresh
    docs.ts                Create doc, batch insert blocks
    files.ts               Upload media
tests/
  md-to-blocks.test.ts    30 tests
  fixtures/                Sample .md files
```

## Dependencies

Just two: `marked` (Markdown parser) + `minimist` (arg parsing). Lark API calls use native `fetch`.

## License

MIT
