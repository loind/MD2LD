import { marked, type Token, type Tokens } from "marked";
import {
    type LarkBlock,
    type TextElement,
    type TextElementStyle,
    type ConvertResult,
    BlockType,
    LANG_MAP,
} from "./types";

/**
 * Convert a Markdown string to Lark Document blocks.
 *
 * Auto-extracts the first H1 as the document title.
 */
export function mdToBlocks(markdown: string): ConvertResult {
    const tokens = marked.lexer(markdown);
    let title = "Untitled";
    let titleExtracted = false;

    const blocks: LarkBlock[] = [];

    for (const token of tokens) {
        // Extract first H1 as document title
        if (!titleExtracted && token.type === "heading" && (token as Tokens.Heading).depth === 1) {
            title = (token as Tokens.Heading).text;
            titleExtracted = true;
            continue;
        }

        const converted = tokenToBlocks(token);
        blocks.push(...converted);
    }

    return { title, blocks };
}

function tokenToBlocks(token: Token): LarkBlock[] {
    switch (token.type) {
        case "heading":
            return [headingBlock(token as Tokens.Heading)];
        case "paragraph":
            return [paragraphBlock(token as Tokens.Paragraph)];
        case "list":
            return listBlocks(token as Tokens.List);
        case "blockquote":
            return blockquoteBlocks(token as Tokens.Blockquote);
        case "code":
            return [codeBlock(token as Tokens.Code)];
        case "hr":
            return [dividerBlock()];
        case "table":
            return tableBlocks(token as Tokens.Table);
        case "space":
            return [];
        case "html":
            // Treat raw HTML as a paragraph with the text content
            return [makeTextBlock(BlockType.TEXT, [{ text_run: { content: (token as Tokens.HTML).text } }])];
        default:
            return [];
    }
}

// --- Block builders ---

function headingBlock(token: Tokens.Heading): LarkBlock {
    const blockType = (BlockType.HEADING1 + token.depth - 1) as number;
    const elements = inlineTokensToElements(token.tokens || []);
    const headingKey = `heading${token.depth}` as keyof LarkBlock;
    return {
        block_type: blockType,
        [headingKey]: { elements },
    } as LarkBlock;
}

function paragraphBlock(token: Tokens.Paragraph): LarkBlock {
    const elements = inlineTokensToElements(token.tokens || []);

    // Check if this paragraph contains only an image
    if (elements.length === 0 && token.tokens) {
        const imageToken = token.tokens.find((t) => t.type === "image");
        if (imageToken) {
            return imageBlock(imageToken as Tokens.Image);
        }
    }

    return makeTextBlock(BlockType.TEXT, elements);
}

function listBlocks(token: Tokens.List): LarkBlock[] {
    const blockType = token.ordered ? BlockType.ORDERED : BlockType.BULLET;
    const blocks: LarkBlock[] = [];

    for (const item of token.items) {
        // Each list item may contain multiple tokens; take the first paragraph's inline content
        const inlineTokens: Token[] = [];
        for (const child of item.tokens) {
            if (child.type === "text") {
                const textToken = child as Tokens.Text;
                if (textToken.tokens) {
                    inlineTokens.push(...textToken.tokens);
                } else {
                    inlineTokens.push(child);
                }
            } else if (child.type === "paragraph") {
                const paraToken = child as Tokens.Paragraph;
                if (paraToken.tokens) {
                    inlineTokens.push(...paraToken.tokens);
                }
            } else if (child.type === "list") {
                // Nested list: first push current item, then recurse
                break;
            }
        }

        const elements = inlineTokensToElements(inlineTokens);
        const key = token.ordered ? "ordered" : "bullet";
        blocks.push({
            block_type: blockType,
            [key]: { elements },
        } as LarkBlock);

        // Handle nested lists
        for (const child of item.tokens) {
            if (child.type === "list") {
                blocks.push(...listBlocks(child as Tokens.List));
            }
        }
    }

    return blocks;
}

function blockquoteBlocks(token: Tokens.Blockquote): LarkBlock[] {
    const blocks: LarkBlock[] = [];

    for (const child of token.tokens) {
        if (child.type === "paragraph") {
            const elements = inlineTokensToElements((child as Tokens.Paragraph).tokens || []);
            blocks.push({
                block_type: BlockType.QUOTE,
                quote: { elements },
            } as LarkBlock);
        } else {
            // Recurse for other block types inside blockquote
            const inner = tokenToBlocks(child);
            for (const b of inner) {
                // Wrap non-quote blocks as quote
                if (b.block_type !== BlockType.QUOTE) {
                    const textContent = extractTextFromBlock(b);
                    blocks.push({
                        block_type: BlockType.QUOTE,
                        quote: {
                            elements: [{ text_run: { content: textContent } }],
                        },
                    } as LarkBlock);
                } else {
                    blocks.push(b);
                }
            }
        }
    }

    return blocks;
}

function codeBlock(token: Tokens.Code): LarkBlock {
    const lang = (token.lang || "plaintext").toLowerCase().trim();
    const languageCode = LANG_MAP[lang] ?? LANG_MAP["plaintext"];

    return {
        block_type: BlockType.CODE,
        code: {
            style: { language: languageCode },
            elements: [{ text_run: { content: token.text } }],
        },
    } as LarkBlock;
}

function dividerBlock(): LarkBlock {
    return {
        block_type: BlockType.DIVIDER,
        divider: {},
    };
}

function imageBlock(token: Tokens.Image): LarkBlock {
    // Use href as a placeholder; actual file_token will be resolved in Phase 3
    return {
        block_type: BlockType.IMAGE,
        image: { token: token.href },
    };
}

function tableBlocks(token: Tokens.Table): LarkBlock[] {
    const rows = token.header.length > 0 ? 1 + token.rows.length : token.rows.length;
    const cols = token.header.length;

    // Build cell blocks
    const cellBlockIds: string[] = [];
    let cellIndex = 0;

    // Header row
    if (token.header.length > 0) {
        for (const cell of token.header) {
            const elements = inlineTokensToElements(cell.tokens);
            const cellId = `cell_${cellIndex++}`;
            cellBlockIds.push(cellId);
            // Note: in actual API, cells are child blocks referenced by ID.
            // For our output, we'll embed cell content inline.
        }
    }

    // Data rows
    for (const row of token.rows) {
        for (const cell of row) {
            const cellId = `cell_${cellIndex++}`;
            cellBlockIds.push(cellId);
        }
    }

    // Build table block
    const tableBlock: LarkBlock = {
        block_type: BlockType.TABLE,
        table: {
            cells: cellBlockIds,
            property: {
                row_size: rows,
                column_size: cols,
                header_row: token.header.length > 0,
            },
        },
    };

    // Build cell content blocks
    const cellBlocks: LarkBlock[] = [];
    cellIndex = 0;

    if (token.header.length > 0) {
        for (const cell of token.header) {
            const elements = inlineTokensToElements(cell.tokens);
            cellBlocks.push({
                block_type: BlockType.TABLE_CELL,
                text: {
                    elements: elements.length > 0 ? elements : [{ text_run: { content: "" } }],
                },
            });
        }
    }

    for (const row of token.rows) {
        for (const cell of row) {
            const elements = inlineTokensToElements(cell.tokens);
            cellBlocks.push({
                block_type: BlockType.TABLE_CELL,
                text: {
                    elements: elements.length > 0 ? elements : [{ text_run: { content: "" } }],
                },
            });
        }
    }

    return [tableBlock, ...cellBlocks];
}

// --- Inline token processing ---

function inlineTokensToElements(tokens: Token[]): TextElement[] {
    const elements: TextElement[] = [];

    for (const token of tokens) {
        switch (token.type) {
            case "text": {
                const t = token as Tokens.Text;
                elements.push({ text_run: { content: t.text } });
                break;
            }
            case "strong": {
                const t = token as Tokens.Strong;
                const innerElements = inlineTokensToElements(t.tokens || []);
                for (const el of innerElements) {
                    if (el.text_run) {
                        el.text_run.text_element_style = {
                            ...el.text_run.text_element_style,
                            bold: true,
                        };
                    }
                }
                elements.push(...innerElements);
                break;
            }
            case "em": {
                const t = token as Tokens.Em;
                const innerElements = inlineTokensToElements(t.tokens || []);
                for (const el of innerElements) {
                    if (el.text_run) {
                        el.text_run.text_element_style = {
                            ...el.text_run.text_element_style,
                            italic: true,
                        };
                    }
                }
                elements.push(...innerElements);
                break;
            }
            case "del": {
                const t = token as Tokens.Del;
                const innerElements = inlineTokensToElements(t.tokens || []);
                for (const el of innerElements) {
                    if (el.text_run) {
                        el.text_run.text_element_style = {
                            ...el.text_run.text_element_style,
                            strikethrough: true,
                        };
                    }
                }
                elements.push(...innerElements);
                break;
            }
            case "codespan": {
                const t = token as Tokens.Codespan;
                elements.push({
                    text_run: {
                        content: t.text,
                        text_element_style: { inline_code: true },
                    },
                });
                break;
            }
            case "link": {
                const t = token as Tokens.Link;
                const linkText = t.text || t.href;
                elements.push({
                    text_run: {
                        content: linkText,
                        text_element_style: { link: { url: t.href } },
                    },
                });
                break;
            }
            case "image": {
                // Images in inline context: represented as text with the alt text
                // Actual image handling will be done at block level
                const t = token as Tokens.Image;
                elements.push({
                    text_run: {
                        content: `[image: ${t.text || t.href}]`,
                    },
                });
                break;
            }
            case "br": {
                elements.push({ text_run: { content: "\n" } });
                break;
            }
            case "escape": {
                const t = token as Tokens.Escape;
                elements.push({ text_run: { content: t.text } });
                break;
            }
            default:
                // Fallback: try to extract raw text
                if ("text" in token && typeof (token as any).text === "string") {
                    elements.push({ text_run: { content: (token as any).text } });
                }
                break;
        }
    }

    return elements;
}

// --- Helpers ---

function makeTextBlock(blockType: number, elements: TextElement[]): LarkBlock {
    return {
        block_type: blockType,
        text: { elements: elements.length > 0 ? elements : [{ text_run: { content: "" } }] },
    };
}

function extractTextFromBlock(block: LarkBlock): string {
    const content =
        block.text || block.heading1 || block.heading2 || block.heading3 ||
        block.heading4 || block.heading5 || block.heading6 ||
        block.bullet || block.ordered || block.quote || block.code;

    if (!content?.elements) return "";
    return content.elements.map((el) => el.text_run?.content || "").join("");
}
