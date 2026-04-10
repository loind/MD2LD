import { getToken } from "./auth";
import type { LarkBlock, TableGroup } from "../converter/types";

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

interface DescendantResponse {
    code: number;
    msg: string;
    data?: unknown;
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
 * Check if a block carries a TableGroup (created by md-to-blocks tableBlocks).
 */
function getTableGroup(block: LarkBlock): TableGroup | undefined {
    return (block as any).__tableGroup;
}

/**
 * Insert blocks into a Lark document.
 *
 * Regular blocks are batched via the /children API.
 * Table blocks use the /descendant API to create table + cells + content in one call.
 */
export async function insertBlocks(documentId: string, blocks: LarkBlock[]): Promise<void> {
    const blockId = await getDocumentBlockId(documentId);

    // Split blocks into sequential segments of regular blocks vs table groups
    type Segment =
        | { type: "regular"; blocks: LarkBlock[] }
        | { type: "table"; group: TableGroup };

    const segments: Segment[] = [];
    let currentRegular: LarkBlock[] = [];

    for (const block of blocks) {
        const tg = getTableGroup(block);
        if (tg) {
            // Flush accumulated regular blocks
            if (currentRegular.length > 0) {
                segments.push({ type: "regular", blocks: currentRegular });
                currentRegular = [];
            }
            segments.push({ type: "table", group: tg });
        } else {
            currentRegular.push(block);
        }
    }
    if (currentRegular.length > 0) {
        segments.push({ type: "regular", blocks: currentRegular });
    }

    // Process segments in order
    let isFirst = true;
    for (const seg of segments) {
        if (seg.type === "regular") {
            for (let i = 0; i < seg.blocks.length; i += BATCH_SIZE) {
                const batch = seg.blocks.slice(i, i + BATCH_SIZE);
                const index = isFirst && i === 0 ? 0 : -1;
                try {
                    await insertBatch(documentId, blockId, batch, index);
                } catch {
                    // Fallback: insert one by one to skip bad blocks
                    console.error(`Batch failed, falling back to one-by-one...`);
                    for (const block of batch) {
                        try {
                            await insertBatch(documentId, blockId, [block], -1);
                        } catch (e: any) {
                            console.error(`  Skipping block type ${block.block_type}: ${e.message?.slice(0, 100)}`);
                        }
                    }
                }
            }
        } else {
            try {
                await insertTableDescendant(documentId, blockId, seg.group, isFirst);
            } catch (e: any) {
                console.error(`  Table insert failed: ${e.message?.slice(0, 100)}`);
            }
        }
        isFirst = false;
    }
}

/**
 * Insert a table using the descendant API.
 * Creates the table container + all cells + cell content in a single request.
 */
async function insertTableDescendant(
    documentId: string,
    parentBlockId: string,
    group: TableGroup,
    isFirst: boolean,
    retries = 0,
): Promise<void> {
    const token = await getToken();

    const body = {
        children_id: [group.tableBlockId],
        descendants: group.descendants,
        index: isFirst ? 0 : -1,
    };

    const resp = await fetch(
        `${LARK_BASE}/docx/v1/documents/${documentId}/blocks/${parentBlockId}/descendant?document_revision_id=-1`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        },
    );

    if (resp.status === 429 && retries < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retries);
        console.error(`Rate limited (table), retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return insertTableDescendant(documentId, parentBlockId, group, isFirst, retries + 1);
    }

    const data = (await resp.json()) as DescendantResponse;
    if (data.code !== 0) {
        throw new Error(`Failed to insert table: ${data.code} ${(data as any).msg}`);
    }
}

/**
 * Insert a batch of regular (non-table) blocks via the /children API.
 */
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
                index: index === 0 ? 0 : -1,
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
 *
 * Uses LARK_DOMAIN env var (e.g., "mycompany.larksuite.com").
 * Falls back to document ID only if domain is not configured.
 */
export function getDocUrl(documentId: string): string {
    const domain = process.env.LARK_DOMAIN;
    if (domain) {
        return `https://${domain}/docx/${documentId}`;
    }
    return `docx/${documentId} (set LARK_DOMAIN env to get full URL)`;
}
