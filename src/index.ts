#!/usr/bin/env bun
import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import minimist from "minimist";
import { mdToBlocks } from "./converter/md-to-blocks";
import { detectDiagramType, renderAndUploadDiagram } from "./converter/diagrams";
import { uploadImageFromUrl, uploadImageFromFile } from "./converter/image-upload";
import { createDocument, insertBlocks, getDocUrl } from "./lark/docs";
import { setCredentials, setUserTokenFile, getTokenType } from "./lark/auth";
import { validateImagePath } from "./security";
import type { LarkBlock } from "./converter/types";
import { BlockType } from "./converter/types";

// Load .env file from home directory if exists
function loadEnv(): void {
    const envPaths = [
        join(process.env.HOME || "~", ".md2ld.env"),
        join(process.cwd(), ".env"),
    ];

    for (const envPath of envPaths) {
        if (existsSync(envPath)) {
            const content = readFileSync(envPath, "utf-8");
            for (const line of content.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) continue;
                const eqIdx = trimmed.indexOf("=");
                if (eqIdx === -1) continue;
                const key = trimmed.slice(0, eqIdx).trim();
                const value = trimmed.slice(eqIdx + 1).trim();
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        }
    }
}

function printUsage(): void {
    console.log(`md2ld - Push Markdown files to Lark Docs

Usage:
  md2ld <file.md> [options]

Options:
  --app-id <id>              Lark app ID (or env LARK_APP_ID)
  --app-secret-file <path>   File containing Lark app secret (or env LARK_APP_SECRET)
  --user-token-file <path>   JSON file with user_access_token (or env LARK_USER_TOKEN_FILE)
  --folder <token>           Lark folder token (or env LARK_FOLDER)
  --title <string>     Override document title (default: first H1)
  --no-diagrams        Keep diagrams as code blocks, don't render
  --append <doc-id>    Append to existing doc instead of creating new
  --dry-run            Print JSON blocks to stdout, don't call API
  -h, --help           Show this help

Authentication:
  User token (--user-token-file) takes priority over tenant token.
  User tokens have broader scopes (docx:document:create, drive:file:upload).
  Use lark-token-renew to obtain user tokens via OAuth.

Environment (fallback when flags not provided):
  LARK_APP_ID              Lark app ID
  LARK_APP_SECRET          Lark app secret
  LARK_USER_TOKEN_FILE     Path to user token JSON file
  LARK_FOLDER              Default folder token

Config files (loaded automatically):
  ~/.md2ld.env
  ./.env
`);
}

async function processImages(
    blocks: LarkBlock[],
    mdFilePath: string,
): Promise<LarkBlock[]> {
    const mdDir = dirname(resolve(mdFilePath));
    const processed: LarkBlock[] = [];

    for (const block of blocks) {
        if (block.block_type === BlockType.IMAGE && block.image?.token) {
            const src = block.image.token;
            try {
                let fileToken: string;
                if (src.startsWith("http://") || src.startsWith("https://")) {
                    fileToken = await uploadImageFromUrl(src);
                } else {
                    // Resolve and validate: must stay within the markdown file's directory
                    const absPath = validateImagePath(src, mdDir);
                    fileToken = await uploadImageFromFile(absPath);
                }
                processed.push({
                    ...block,
                    image: { token: fileToken },
                });
            } catch (err) {
                console.error(`Warning: Failed to upload image "${src}": ${err}`);
                // Fallback: insert a text block with the image reference
                processed.push({
                    block_type: BlockType.TEXT,
                    text: {
                        elements: [{ text_run: { content: `[Image: ${src}]` } }],
                    },
                });
            }
        } else {
            processed.push(block);
        }
    }

    return processed;
}

async function processDiagrams(blocks: LarkBlock[]): Promise<LarkBlock[]> {
    const processed: LarkBlock[] = [];

    for (const block of blocks) {
        if (block.block_type === BlockType.CODE && block.code) {
            // Check if this code block is a diagram
            const langCode = block.code.style?.language;
            const codeContent = block.code.elements?.[0]?.text_run?.content || "";

            // We need to reverse-lookup the language name from the code
            // Instead, we'll check the original markdown for diagram fences
            // For now, detect via known diagram patterns in content
            const diagramType = detectDiagramFromContent(codeContent);

            if (diagramType) {
                try {
                    const fileToken = await renderAndUploadDiagram(codeContent, diagramType);
                    processed.push({
                        block_type: BlockType.IMAGE,
                        image: { token: fileToken },
                    });
                    continue;
                } catch (err) {
                    console.error(`Warning: Diagram render failed, keeping as code: ${err}`);
                }
            }
        }
        processed.push(block);
    }

    return processed;
}

function detectDiagramFromContent(content: string): ReturnType<typeof detectDiagramType> {
    // Heuristic detection based on content patterns
    const trimmed = content.trim();
    if (trimmed.startsWith("graph ") || trimmed.startsWith("sequenceDiagram") ||
        trimmed.startsWith("flowchart") || trimmed.startsWith("classDiagram") ||
        trimmed.startsWith("stateDiagram") || trimmed.startsWith("gantt") ||
        trimmed.startsWith("pie") || trimmed.startsWith("erDiagram") ||
        trimmed.startsWith("gitgraph")) {
        return "mermaid";
    }
    if (trimmed.startsWith("@startuml") || trimmed.startsWith("@startmindmap")) {
        return "plantuml";
    }
    if (trimmed.startsWith("digraph") || trimmed.startsWith("graph {") || trimmed.startsWith("strict")) {
        return "graphviz";
    }
    return null;
}

async function main(): Promise<void> {
    loadEnv();

    const args = minimist(process.argv.slice(2), {
        string: ["folder", "title", "append", "app-id", "app-secret-file", "user-token-file"],
        boolean: ["dry-run", "no-diagrams", "help"],
        alias: { h: "help" },
    });

    if (args.help || args._.length === 0) {
        printUsage();
        process.exit(args.help ? 0 : 1);
    }

    const filePath = args._[0] as string;
    if (!existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
    }

    const markdown = readFileSync(filePath, "utf-8");
    const { title: autoTitle, blocks } = mdToBlocks(markdown);
    const title = args.title || autoTitle;

    // Dry run: just output JSON
    if (args["dry-run"]) {
        console.log(JSON.stringify({ title, blocks }, null, 2));
        process.exit(0);
    }

    // Resolve user token file: CLI flag > env var
    const userTokenFilePath = args["user-token-file"] || process.env.LARK_USER_TOKEN_FILE;

    // Resolve app credentials: CLI args > env vars (already loaded from .env files)
    const appId = args["app-id"] || process.env.LARK_APP_ID;
    let appSecret = process.env.LARK_APP_SECRET;

    // Read secret from file if --app-secret-file is provided (avoids ps exposure)
    const secretFile = args["app-secret-file"];
    if (secretFile) {
        if (!existsSync(secretFile)) {
            console.error(`Error: Secret file not found: ${secretFile}`);
            process.exit(1);
        }
        appSecret = readFileSync(secretFile, "utf-8").trim();
    }

    // Set app credentials if available (needed for token refresh even with user token)
    if (appId && appSecret) {
        setCredentials(appId, appSecret);
    }

    // Set user token if available (takes priority over tenant token)
    if (userTokenFilePath) {
        if (!existsSync(userTokenFilePath)) {
            console.error(`Error: User token file not found: ${userTokenFilePath}`);
            process.exit(1);
        }
        setUserTokenFile(userTokenFilePath);
    } else if (!appId || !appSecret) {
        console.error("Error: Lark credentials required.");
        console.error("Pass --user-token-file, or --app-id and --app-secret-file, or set env vars.");
        process.exit(1);
    }

    console.log(`Converting: ${filePath}`);
    console.log(`Title: ${title}`);
    console.log(`Blocks: ${blocks.length}`);
    console.log(`Auth: ${getTokenType()}_access_token`);

    // Process images
    let processedBlocks = await processImages(blocks, filePath);

    // Process diagrams (unless --no-diagrams)
    if (!args["no-diagrams"]) {
        processedBlocks = await processDiagrams(processedBlocks);
    }

    // Create or append to document
    const folder = args.folder || process.env.LARK_FOLDER;
    let documentId: string;

    if (args.append) {
        documentId = args.append;
        console.log(`Appending to: ${documentId}`);
    } else {
        documentId = await createDocument(title, folder);
        console.log(`Created document: ${documentId}`);
    }

    // Insert blocks
    await insertBlocks(documentId, processedBlocks);

    const url = getDocUrl(documentId);
    console.log(`\n✅ Done: ${url}`);
}

main().catch((err) => {
    console.error(`Error: ${err.message || err}`);
    process.exit(1);
});
