import { resolve } from "path";

/**
 * Validate that a resolved file path stays within allowed roots.
 *
 * Prevents arbitrary file read via path traversal.
 */
export function validateFilePath(filePath: string, allowedRoots: string[]): string {
    const absPath = resolve(filePath);

    // Must end with .md or .markdown
    if (!absPath.endsWith(".md") && !absPath.endsWith(".markdown")) {
        throw new Error("Only .md and .markdown files are allowed.");
    }

    // Must be within one of the allowed root directories
    const isAllowed = allowedRoots.some((root) => {
        const normalizedRoot = resolve(root);
        return absPath === normalizedRoot || absPath.startsWith(normalizedRoot + "/");
    });

    if (!isAllowed) {
        throw new Error("File path is outside allowed directories.");
    }

    return absPath;
}

/**
 * Validate that a resolved image path stays within the markdown file's directory tree.
 *
 * Prevents path traversal via image references like `![](../../../../etc/passwd)`.
 */
export function validateImagePath(imagePath: string, mdDir: string): string {
    const absPath = resolve(mdDir, imagePath);
    const normalizedRoot = resolve(mdDir);

    if (!absPath.startsWith(normalizedRoot + "/") && absPath !== normalizedRoot) {
        throw new Error("Image path escapes the document directory.");
    }

    return absPath;
}

/** Blocked private/internal IP ranges (SSRF protection). */
const BLOCKED_HOSTS = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/,      // AWS metadata
    /^0\.0\.0\.0$/,
    /^\[::1?\]$/,                 // IPv6 loopback
    /\.local$/i,                  // mDNS
    /\.internal$/i,
    /\.corp$/i,
];

/**
 * Validate an image URL for safe fetching.
 *
 * Blocks: non-HTTP(S) schemes, private/internal hosts, metadata endpoints.
 */
export function validateImageUrl(url: string): URL {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error("Invalid image URL.");
    }

    // Only allow HTTP and HTTPS
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`Blocked URL scheme: ${parsed.protocol}`);
    }

    // Block private/internal hosts
    const hostname = parsed.hostname;
    for (const pattern of BLOCKED_HOSTS) {
        if (pattern.test(hostname)) {
            throw new Error("Blocked: URL points to a private/internal address.");
        }
    }

    return parsed;
}

/**
 * Sanitize an error message before returning it to external callers (MCP clients).
 *
 * Strips absolute file paths and internal details.
 */
export function sanitizeError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);

    // Strip absolute paths (Unix and Windows)
    return msg
        .replace(/\/[^\s:'"]+/g, "[path]")
        .replace(/[A-Z]:\\[^\s:'"]+/gi, "[path]");
}
