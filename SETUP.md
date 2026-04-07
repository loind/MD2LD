# lark-push — Setup Guide

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
# -> dist/lark-push

# 4. Copy to PATH
sudo cp dist/lark-push /usr/local/bin/
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
# Pass credentials as flags
lark-push README.md --app-id cli_xxx --app-secret xxx --folder fldXXX

# Or set env vars (add to ~/.bashrc or ~/.zshrc)
export LARK_APP_ID=cli_xxx
export LARK_APP_SECRET=xxx
export LARK_FOLDER=fldXXX
lark-push README.md

# Or use config file
cat > ~/.lark-push.env << 'EOF'
LARK_APP_ID=cli_xxx
LARK_APP_SECRET=xxx
LARK_FOLDER=fldXXX
EOF
lark-push README.md
```

## Claude Code Integration

Copy the slash command to any repo where you want to use it:

```bash
mkdir -p .claude/commands
cp MD2LD/.claude/commands/lark-push.md .claude/commands/
```

Then in Claude Code:
```
/lark-push docs/design.md
```

## Cross-platform Build

```bash
# macOS ARM (M1/M2/M3/M4)
bun build src/index.ts --compile --target bun-darwin-arm64 --outfile dist/lark-push-macos-arm64

# macOS Intel
bun build src/index.ts --compile --target bun-darwin-x64 --outfile dist/lark-push-macos-x64

# Linux x64
bun build src/index.ts --compile --target bun-linux-x64 --outfile dist/lark-push-linux-x64
```
