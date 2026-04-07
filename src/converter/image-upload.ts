import { readFileSync, existsSync } from "fs";
import { basename } from "path";
import { uploadImage } from "../lark/files";
import { validateImageUrl } from "../security";

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * Fetch an image from a URL, upload to Lark, return file_token.
 *
 * Validates URL scheme (HTTP/HTTPS only) and blocks private/internal hosts.
 */
export async function uploadImageFromUrl(url: string): Promise<string> {
    const parsed = validateImageUrl(url);

    const resp = await fetch(parsed.href);
    if (!resp.ok) {
        throw new Error(`Failed to fetch image (${resp.status})`);
    }

    const contentLength = resp.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
        throw new Error("Image too large (max 20 MB).");
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_SIZE) {
        throw new Error("Image too large (max 20 MB).");
    }

    const filename = basename(parsed.pathname) || "image.png";
    return uploadImage(buffer, filename);
}

/**
 * Read a local image file and upload to Lark, return file_token.
 */
export async function uploadImageFromFile(path: string): Promise<string> {
    if (!existsSync(path)) {
        throw new Error(`Image file not found: ${path}`);
    }

    const buffer = readFileSync(path);
    const filename = basename(path);
    return uploadImage(Buffer.from(buffer), filename);
}

/**
 * Upload a raw buffer as an image to Lark, return file_token.
 */
export async function uploadImageFromBuffer(buffer: Buffer, filename: string): Promise<string> {
    return uploadImage(buffer, filename);
}
