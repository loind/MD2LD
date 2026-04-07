#!/usr/bin/env bun
/**
 * MCP (Model Context Protocol) server wrapper for md2ld.
 *
 * Exposes md2ld as a tool over JSON-RPC stdio, so Claude Desktop
 * and Claude Code can call it directly.
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { tmpdir } from "os";
import { mdToBlocks } from "./converter/md-to-blocks";
import { createDocument, insertBlocks, getDocUrl } from "./lark/docs";
import { setCredentials } from "./lark/auth";
import type { LarkBlock } from "./converter/types";
import { BlockType } from "./converter/types";

// --- MCP Protocol types ---

interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: number | string;
    method: string;
    params?: Record<string, any>;
}

interface JsonRpcResponse {
    jsonrpc: "2.0";
    id: number | string | null;
    result?: any;
    error?: { code: number; message: string; data?: any };
}

// --- Tool definitions ---

const TOOLS = [
    {
        name: "md2ld",
        description: "Convert a Markdown file or raw Markdown text to a Lark Doc. Returns the document URL on success.",
        inputSchema: {
            type: "object" as const,
            properties: {
                file: {
                    type: "string",
                    description: "Absolute path to a .md file to push to Lark Docs.",
                },
                markdown: {
                    type: "string",
                    description: "Raw Markdown content to push (used when file is not provided).",
                },
                title: {
                    type: "string",
                    description: "Override document title (default: first H1 in the Markdown).",
                },
                folder: {
                    type: "string",
                    description: "Lark folder token to create the doc in.",
                },
                app_id: {
                    type: "string",
                    description: "Lark App ID (falls back to LARK_APP_ID env var).",
                },
                app_secret: {
                    type: "string",
                    description: "Lark App Secret (falls back to LARK_APP_SECRET env var).",
                },
                dry_run: {
                    type: "boolean",
                    description: "If true, return the Lark Block JSON without calling the API.",
                },
            },
        },
    },
    {
        name: "md2ld_preview",
        description: "Preview how Markdown will be converted to Lark blocks (dry run). Returns the block JSON without creating a doc.",
        inputSchema: {
            type: "object" as const,
            properties: {
                file: {
                    type: "string",
                    description: "Absolute path to a .md file.",
                },
                markdown: {
                    type: "string",
                    description: "Raw Markdown content.",
                },
            },
        },
    },
];

// --- Load env from config files ---

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

// --- Tool handlers ---

async function handleMd2ld(params: Record<string, any>): Promise<string> {
    const { file, markdown, title: overrideTitle, folder, app_id, app_secret, dry_run } = params;

    let md: string;
    if (file) {
        const absPath = resolve(file);
        if (!existsSync(absPath)) {
            throw new Error(`File not found: ${absPath}`);
        }
        md = readFileSync(absPath, "utf-8");
    } else if (markdown) {
        md = markdown;
    } else {
        throw new Error("Either 'file' or 'markdown' must be provided.");
    }

    const { title: autoTitle, blocks } = mdToBlocks(md);
    const title = overrideTitle || autoTitle;

    if (dry_run) {
        return JSON.stringify({ title, blocks }, null, 2);
    }

    // Resolve credentials
    const appId = app_id || process.env.LARK_APP_ID;
    const appSecret = app_secret || process.env.LARK_APP_SECRET;
    if (!appId || !appSecret) {
        throw new Error(
            "Lark credentials required. Provide app_id/app_secret params, or set LARK_APP_ID/LARK_APP_SECRET env vars."
        );
    }
    setCredentials(appId, appSecret);

    const folderToken = folder || process.env.LARK_FOLDER;
    const documentId = await createDocument(title, folderToken);
    await insertBlocks(documentId, blocks);

    const url = getDocUrl(documentId);
    return `Created: ${url}`;
}

async function handlePreview(params: Record<string, any>): Promise<string> {
    const { file, markdown } = params;

    let md: string;
    if (file) {
        const absPath = resolve(file);
        if (!existsSync(absPath)) {
            throw new Error(`File not found: ${absPath}`);
        }
        md = readFileSync(absPath, "utf-8");
    } else if (markdown) {
        md = markdown;
    } else {
        throw new Error("Either 'file' or 'markdown' must be provided.");
    }

    const { title, blocks } = mdToBlocks(md);
    return JSON.stringify({ title, block_count: blocks.length, blocks }, null, 2);
}

// --- JSON-RPC dispatch ---

function makeResult(id: number | string | null, result: any): JsonRpcResponse {
    return { jsonrpc: "2.0", id, result };
}

function makeError(id: number | string | null, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: "2.0", id, error: { code, message } };
}

async function dispatch(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    switch (req.method) {
        case "initialize":
            return makeResult(req.id, {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "md2ld", version: "1.0.0" },
            });

        case "notifications/initialized":
            // No response needed for notifications
            return null as any;

        case "tools/list":
            return makeResult(req.id, { tools: TOOLS });

        case "tools/call": {
            const toolName = req.params?.name;
            const args = req.params?.arguments || {};

            try {
                let text: string;
                if (toolName === "md2ld") {
                    text = await handleMd2ld(args);
                } else if (toolName === "md2ld_preview") {
                    text = await handlePreview(args);
                } else {
                    return makeError(req.id, -32601, `Unknown tool: ${toolName}`);
                }
                return makeResult(req.id, {
                    content: [{ type: "text", text }],
                });
            } catch (err: any) {
                return makeResult(req.id, {
                    content: [{ type: "text", text: `Error: ${err.message}` }],
                    isError: true,
                });
            }
        }

        default:
            return makeError(req.id, -32601, `Method not found: ${req.method}`);
    }
}

// --- Stdio transport ---

function send(msg: JsonRpcResponse): void {
    const json = JSON.stringify(msg);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

async function main(): Promise<void> {
    loadEnv();

    let buffer = "";

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", async (chunk: string) => {
        buffer += chunk;

        while (true) {
            // Parse header
            const headerEnd = buffer.indexOf("\r\n\r\n");
            if (headerEnd === -1) break;

            const header = buffer.slice(0, headerEnd);
            const match = header.match(/Content-Length:\s*(\d+)/i);
            if (!match) {
                buffer = buffer.slice(headerEnd + 4);
                continue;
            }

            const contentLength = parseInt(match[1], 10);
            const bodyStart = headerEnd + 4;
            const bodyEnd = bodyStart + contentLength;

            if (buffer.length < bodyEnd) break; // Wait for more data

            const body = buffer.slice(bodyStart, bodyEnd);
            buffer = buffer.slice(bodyEnd);

            try {
                const req = JSON.parse(body) as JsonRpcRequest;
                const res = await dispatch(req);
                if (res) send(res);
            } catch {
                send(makeError(null, -32700, "Parse error"));
            }
        }
    });

    process.stdin.on("end", () => process.exit(0));
}

main();
