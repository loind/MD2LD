import { readFileSync, existsSync } from "fs";
import { basename } from "path";
import { uploadImage } from "../lark/files";

/**
 * Fetch an image from a URL, upload to Lark, return file_token.
 */
export async function uploadImageFromUrl(url: string): Promise<string> {
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`Failed to fetch image: ${url} (${resp.status})`);
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    const filename = basename(new URL(url).pathname) || "image.png";
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
