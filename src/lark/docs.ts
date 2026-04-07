import { getToken } from "./auth";
import type { LarkBlock } from "../converter/types";

const LARK_BASE = "https://open.larksuite.com/open-apis";
const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

interface CreateDocResponse {
    code: number;
    msg: string;
    data: {
        document: {
            document_id: string;
            title: string;
        };
    };
}

interface BlockChildrenResponse {
    code: number;
    msg: string;
    data: {
        children: { block_id: string }[];
    };
}

interface DocumentResponse {
    code: number;
    msg: string;
    data: {
        document: {
            document_id: string;
            revision_id: number;
            title: string;
        };
    };
}

/**
 * Create a new Lark document.
 *
 * Returns the document_id.
 */
export async function createDocument(title: string, folderToken?: string): Promise<string> {
    const token = await getToken();

    const body: Record<string, any> = { title };
    if (folderToken) {
        body.folder_token = folderToken;
    }

    const resp = await fetch(`${LARK_BASE}/docx/v1/documents`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });

    const data = (await resp.json()) as CreateDocResponse;
    if (data.code !== 0) {
        throw new Error(`Failed to create document: ${data.code} ${data.msg}`);
    }

    return data.data.document.document_id;
}

/**
 * Get the root block ID of a document (the page block).
 */
async function getDocumentBlockId(documentId: string): Promise<string> {
    const token = await getToken();

    const resp = await fetch(`${LARK_BASE}/docx/v1/documents/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    const data = (await resp.json()) as DocumentResponse;
    if (data.code !== 0) {
        throw new Error(`Failed to get document: ${data.code} ${data.msg}`);
    }

    return data.data.document.document_id;
}

/**
 * Insert blocks into a Lark document.
 *
 * Batches requests at BATCH_SIZE blocks per API call.
 * Retries on 429 (rate limit) with exponential backoff.
 */
export async function insertBlocks(documentId: string, blocks: LarkBlock[]): Promise<void> {
    const blockId = await getDocumentBlockId(documentId);

    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
        const batch = blocks.slice(i, i + BATCH_SIZE);
        await insertBatch(documentId, blockId, batch, i);
    }
}

async function insertBatch(
    documentId: string,
    blockId: string,
    blocks: LarkBlock[],
    index: number,
    retries = 0,
): Promise<void> {
    const token = await getToken();

    const resp = await fetch(
        `${LARK_BASE}/docx/v1/documents/${documentId}/blocks/${blockId}/children`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                children: blocks,
                index: index === 0 ? 0 : -1, // 0 for first batch, -1 (append) for rest
            }),
        },
    );

    if (resp.status === 429 && retries < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retries);
        console.error(`Rate limited, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return insertBatch(documentId, blockId, blocks, index, retries + 1);
    }

    const data = (await resp.json()) as BlockChildrenResponse;
    if (data.code !== 0) {
        throw new Error(`Failed to insert blocks: ${data.code} ${data.msg}`);
    }
}

/**
 * Get the URL for a Lark document.
 */
export function getDocUrl(documentId: string): string {
    return `https://xxx.larksuite.com/docx/${documentId}`;
}
