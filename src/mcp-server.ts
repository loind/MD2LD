#!/usr/bin/env bun
/**
 * MCP (Model Context Protocol) server wrapper for md2ld.
 *
 * Exposes md2ld as a tool over JSON-RPC stdio, so Claude Desktop
 * and Claude Code can call it directly.
 *
 * Security: credentials are read ONLY from env vars (never from tool params).
 * File access is restricted to allowed roots via MD2LD_ALLOWED_ROOTS env var.
 */
import { readFileSync, existsSync, appendFileSync } from "fs";
import { resolve, join } from "path";
import { mdToBlocks } from "./converter/md-to-blocks";
import { createDocument, insertBlocks, getDocUrl } from "./lark/docs";
import { setCredentials, setUserTokenFile, getTokenType } from "./lark/auth";
import { validateFilePath, sanitizeError } from "./security";

// --- Debug logging (enable with MD2LD_DEBUG=1) ---
const DEBUG = process.env.MD2LD_DEBUG === "1";
const LOG_FILE = "/tmp/md2ld-mcp-protocol.log";

function debugLog(direction: string, data: any): void {
    if (!DEBUG) return;
    try {
        const ts = new Date().toISOString();
        const msg = typeof data === "string" ? data : JSON.stringify(data);
        appendFileSync(LOG_FILE, `[${ts}] ${direction}: ${msg}\n`);
    } catch {}
}

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

// --- Allowed roots for file access ---

function getAllowedRoots(): string[] {
    const envRoots = process.env.MD2LD_ALLOWED_ROOTS;
    if (envRoots) {
        return envRoots.split(":").map((r) => resolve(r.trim())).filter(Boolean);
    }
    // Default: current working directory only
    return [resolve(process.cwd())];
}

// --- Tool definitions ---

const TOOLS = [
    {
        name: "md2ld",
        description: "Convert a Markdown file or raw Markdown text to a Lark Doc. Returns the document URL on success. Credentials must be set via environment variables (LARK_APP_ID, LARK_APP_SECRET).",
        inputSchema: {
            type: "object" as const,
            properties: {
                file: {
                    type: "string",
                    description: "Path to a .md file to push to Lark Docs. Must be within allowed directories.",
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
                    description: "Path to a .md file. Must be within allowed directories.",
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

// --- Safe file reader ---

function readMarkdownFile(file: string): string {
    const allowedRoots = getAllowedRoots();
    const absPath = validateFilePath(file, allowedRoots);

    if (!existsSync(absPath)) {
        throw new Error("File not found.");
    }

    return readFileSync(absPath, "utf-8");
}

// --- Tool handlers ---

async function handleMd2ld(params: Record<string, any>): Promise<string> {
    const { file, markdown, title: overrideTitle, folder, dry_run } = params;

    let md: string;
    if (file) {
        md = readMarkdownFile(file);
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

    // Credentials: user token (preferred) or tenant token from env
    if (getTokenType() === "tenant") {
        const appId = process.env.LARK_APP_ID;
        const appSecret = process.env.LARK_APP_SECRET;
        if (!appId || !appSecret) {
            throw new Error("No auth configured. Set LARK_USER_TOKEN_FILE or LARK_APP_ID + LARK_APP_SECRET.");
        }
        setCredentials(appId, appSecret);
    }

    const folderToken = folder || process.env.LARK_FOLDER;
    const documentId = await createDocument(title, folderToken);
    await insertBlocks(documentId, blocks);

    const url = getDocUrl(documentId);
    return `Created (${getTokenType()} token): ${url}`;
}

async function handlePreview(params: Record<string, any>): Promise<string> {
    const { file, markdown } = params;

    let md: string;
    if (file) {
        md = readMarkdownFile(file);
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
        case "initialize": {
            // Echo back the client's protocol version for compatibility
            const clientVersion = req.params?.protocolVersion || "2024-11-05";
            return makeResult(req.id, {
                protocolVersion: clientVersion,
                capabilities: { tools: {} },
                serverInfo: { name: "md2ld", version: "1.0.0" },
            });
        }

        case "notifications/initialized":
        case "notifications/cancelled":
            return null as any;

        case "ping":
            return makeResult(req.id, {});

        case "tools/list":
            return makeResult(req.id, { tools: TOOLS });

        case "resources/list":
            return makeResult(req.id, { resources: [] });

        case "prompts/list":
            return makeResult(req.id, { prompts: [] });

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
            } catch (err: unknown) {
                // #7: Sanitize errors — never leak internal paths to MCP callers
                return makeResult(req.id, {
                    content: [{ type: "text", text: `Error: ${sanitizeError(err)}` }],
                    isError: true,
                });
            }
        }

        default:
            // Return empty result for unknown methods to avoid breaking MCP clients
            if (req.method.startsWith("notifications/")) {
                return null as any;
            }
            return makeResult(req.id, {});
    }
}

// --- Stdio transport ---

let useFramedTransport = false; // auto-detect from first request

function send(msg: JsonRpcResponse): void {
    const json = JSON.stringify(msg);
    if (useFramedTransport) {
        process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
    } else {
        process.stdout.write(json + "\n");
    }
}

async function main(): Promise<void> {
    debugLog("STARTUP", `PID=${process.pid} argv=${JSON.stringify(process.argv)}`);
    debugLog("STARTUP", `env: LARK_APP_ID=${process.env.LARK_APP_ID?.slice(0,10)}... USER_TOKEN=${process.env.LARK_USER_TOKEN_FILE || "(none)"}`);
    loadEnv();

    // #6: Set credentials once at startup from env (immutable for session lifetime)
    const appId = process.env.LARK_APP_ID;
    const appSecret = process.env.LARK_APP_SECRET;
    if (appId && appSecret) {
        setCredentials(appId, appSecret);
    }

    // User token file takes priority over tenant token when configured
    const userTokenFilePath = process.env.LARK_USER_TOKEN_FILE;
    if (userTokenFilePath) {
        try {
            setUserTokenFile(userTokenFilePath);
        } catch {
            // Non-fatal: will fall back to tenant token
        }
    }

    let buffer = "";

    async function processMessage(body: string): Promise<void> {
        try {
            const req = JSON.parse(body) as JsonRpcRequest;
            debugLog("REQ", `method=${req.method} id=${req.id}`);
            const res = await dispatch(req);
            if (res) {
                debugLog("RES", `id=${res.id} has_error=${!!res.error}`);
                send(res);
            } else {
                debugLog("RES", "null (notification)");
            }
        } catch (e: any) {
            debugLog("ERR", `Parse error: ${e.message}`);
            send(makeError(null, -32700, "Parse error"));
        }
    }

    function tryParseFramed(): boolean {
        // Try Content-Length framed format
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return false;

        const header = buffer.slice(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) return false;

        const contentLength = parseInt(match[1], 10);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + contentLength;

        if (buffer.length < bodyEnd) return false;

        const body = buffer.slice(bodyStart, bodyEnd);
        buffer = buffer.slice(bodyEnd);
        processMessage(body);
        return true;
    }

    function tryParseNewlineDelimited(): boolean {
        // Try newline-delimited JSON (each line is a complete JSON message)
        const newlineIdx = buffer.indexOf("\n");
        if (newlineIdx === -1) {
            // No newline yet — check if the entire buffer is a complete JSON object
            const trimmed = buffer.trim();
            if (trimmed && trimmed.startsWith("{") && trimmed.endsWith("}")) {
                try {
                    JSON.parse(trimmed); // validate
                    buffer = "";
                    processMessage(trimmed);
                    return true;
                } catch {
                    return false; // incomplete JSON
                }
            }
            return false;
        }

        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (line && line.startsWith("{")) {
            processMessage(line);
        }
        return true;
    }

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", async (chunk: string) => {
        debugLog("STDIN_RAW", `chunk_len=${chunk.length} chunk=${chunk.slice(0, 300)}`);
        buffer += chunk;

        while (buffer.length > 0) {
            // Auto-detect transport from first message
            if (buffer.trimStart().startsWith("Content-Length")) {
                useFramedTransport = true;
                if (!tryParseFramed()) break;
            } else {
                // Newline-delimited JSON (Claude Code default)
                useFramedTransport = false;
                if (!tryParseNewlineDelimited()) break;
            }
        }
    });

    process.stdin.on("end", () => {
        debugLog("STDIN", "end - exiting");
        process.exit(0);
    });

    process.stdin.on("error", (err: any) => {
        debugLog("STDIN_ERR", err.message);
    });

    process.on("SIGTERM", () => {
        debugLog("SIGNAL", "SIGTERM");
        process.exit(0);
    });

    process.on("SIGINT", () => {
        debugLog("SIGNAL", "SIGINT");
        process.exit(0);
    });
}

main();
