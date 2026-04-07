# md2ld

Markdown to Lark Docs. Single binary, zero config.

```bash
md2ld README.md --app-id cli_xxx --app-secret xxx
# -> Created: https://xxx.larksuite.com/docx/AbCdEf
```

## Features

- **Full Markdown support** -- headings, lists, tables, code blocks (72+ languages), blockquotes, dividers, inline styles (bold, italic, strikethrough, inline code, links)
- **Image upload** -- local files and remote URLs are uploaded to Lark automatically
- **Diagram rendering** -- Mermaid, PlantUML, Graphviz code fences are rendered to PNG via Kroki.io and embedded as images
- **Auto title** -- first H1 becomes the document title
- **Single binary** -- compiles to one executable via Bun, no runtime needed
- **MCP server** -- built-in MCP server for Claude Desktop and Claude Code
- **Claude Code integration** -- ships with a `/md2ld` slash command

## Install

```bash
git clone https://github.com/loind/MD2LD.git
cd MD2LD
curl -fsSL https://bun.sh/install | bash   # skip if Bun installed
bun install && bun run build
sudo cp dist/md2ld /usr/local/bin/
```

## Lark App Setup

1. Create app at [open.larksuite.com/app](https://open.larksuite.com/app)
2. Enable permissions: `docx:document`, `docx:document:create`, `drive:drive`, `drive:file:upload`
3. Grab **App ID** and **App Secret**

## Usage

```bash
# Flags
md2ld doc.md --app-id cli_xxx --app-secret xxx --folder fldXXX

# Environment variables
export LARK_APP_ID=cli_xxx
export LARK_APP_SECRET=xxx
md2ld doc.md

# Config file (~/.md2ld.env)
echo "LARK_APP_ID=cli_xxx" >> ~/.md2ld.env
echo "LARK_APP_SECRET=xxx" >> ~/.md2ld.env
md2ld doc.md
```

Credential priority: `--app-id`/`--app-secret` flags > env vars > config files.

### Options

| Flag | Description |
|---|---|
| `--app-id <id>` | Lark app ID |
| `--app-secret <secret>` | Lark app secret |
| `--folder <token>` | Target folder (or `LARK_FOLDER` env) |
| `--title <string>` | Override doc title (default: first H1) |
| `--append <doc-id>` | Append to existing doc |
| `--no-diagrams` | Keep diagrams as code blocks |
| `--dry-run` | Print Lark Block JSON, skip API calls |

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
      "command": "/usr/local/bin/md2ld-mcp",
      "env": {
        "LARK_APP_ID": "cli_xxx",
        "LARK_APP_SECRET": "xxx",
        "LARK_FOLDER": "fldXXX"
      }
    }
  }
}
```

### Claude Code

Add to `.claude/settings.json` (project) or `~/.claude/settings.json` (global):

```json
{
  "mcpServers": {
    "md2ld": {
      "command": "/usr/local/bin/md2ld-mcp",
      "env": {
        "LARK_APP_ID": "cli_xxx",
        "LARK_APP_SECRET": "xxx",
        "LARK_FOLDER": "fldXXX"
      }
    }
  }
}
```

After configuring, Claude can use two tools:

| Tool | Description |
|---|---|
| `md2ld` | Push a file or raw Markdown to Lark Docs, returns the doc URL |
| `md2ld_preview` | Dry run -- returns the Lark Block JSON without creating a doc |

### Install MCP binary

```bash
bun run build                          # builds both dist/md2ld and dist/md2ld-mcp
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
    auth.ts                Token cache + auto refresh
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
