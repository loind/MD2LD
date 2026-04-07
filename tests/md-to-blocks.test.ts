import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { mdToBlocks } from "../src/converter/md-to-blocks";
import { BlockType } from "../src/converter/types";

const fixture = (name: string) =>
    readFileSync(join(import.meta.dir, "fixtures", name), "utf-8");

describe("mdToBlocks", () => {
    describe("simple.md - headings, paragraphs, lists", () => {
        const result = mdToBlocks(fixture("simple.md"));

        test("extracts H1 as title", () => {
            expect(result.title).toBe("My Document Title");
        });

        test("does not include H1 in blocks", () => {
            const h1Blocks = result.blocks.filter((b) => b.block_type === BlockType.HEADING1);
            expect(h1Blocks).toHaveLength(0);
        });

        test("has H2 headings", () => {
            const h2Blocks = result.blocks.filter((b) => b.block_type === BlockType.HEADING2);
            expect(h2Blocks.length).toBeGreaterThanOrEqual(2);
            expect(h2Blocks[0].heading2?.elements[0].text_run?.content).toBe("Introduction");
        });

        test("has H3 heading", () => {
            const h3Blocks = result.blocks.filter((b) => b.block_type === BlockType.HEADING3);
            expect(h3Blocks).toHaveLength(1);
            expect(h3Blocks[0].heading3?.elements[0].text_run?.content).toBe("Features");
        });

        test("has paragraphs", () => {
            const textBlocks = result.blocks.filter((b) => b.block_type === BlockType.TEXT);
            expect(textBlocks.length).toBeGreaterThanOrEqual(2);
        });

        test("has bullet list items", () => {
            const bullets = result.blocks.filter((b) => b.block_type === BlockType.BULLET);
            expect(bullets).toHaveLength(3);
        });

        test("has ordered list items", () => {
            const ordered = result.blocks.filter((b) => b.block_type === BlockType.ORDERED);
            expect(ordered).toHaveLength(3);
        });

        test("bullet item with bold", () => {
            const bullets = result.blocks.filter((b) => b.block_type === BlockType.BULLET);
            const thirdBullet = bullets[2];
            const boldEl = thirdBullet.bullet?.elements.find(
                (el) => el.text_run?.text_element_style?.bold
            );
            expect(boldEl).toBeDefined();
            expect(boldEl?.text_run?.content).toBe("bold");
        });
    });

    describe("code.md - code blocks with languages", () => {
        const result = mdToBlocks(fixture("code.md"));

        test("extracts title", () => {
            expect(result.title).toBe("Code Examples");
        });

        test("has code blocks", () => {
            const codeBlocks = result.blocks.filter((b) => b.block_type === BlockType.CODE);
            expect(codeBlocks).toHaveLength(6);
        });

        test("JavaScript code block has correct language", () => {
            const codeBlocks = result.blocks.filter((b) => b.block_type === BlockType.CODE);
            // First code block is JavaScript
            expect(codeBlocks[0].code?.style?.language).toBe(30);
        });

        test("Python code block has correct language", () => {
            const codeBlocks = result.blocks.filter((b) => b.block_type === BlockType.CODE);
            expect(codeBlocks[1].code?.style?.language).toBe(54);
        });

        test("TypeScript code block has correct language", () => {
            const codeBlocks = result.blocks.filter((b) => b.block_type === BlockType.CODE);
            expect(codeBlocks[2].code?.style?.language).toBe(67);
        });

        test("Go code block has correct language", () => {
            const codeBlocks = result.blocks.filter((b) => b.block_type === BlockType.CODE);
            expect(codeBlocks[3].code?.style?.language).toBe(22);
        });

        test("plain code block defaults to plaintext", () => {
            const codeBlocks = result.blocks.filter((b) => b.block_type === BlockType.CODE);
            expect(codeBlocks[4].code?.style?.language).toBe(1);
        });

        test("bash code block has correct language", () => {
            const codeBlocks = result.blocks.filter((b) => b.block_type === BlockType.CODE);
            expect(codeBlocks[5].code?.style?.language).toBe(7);
        });

        test("code block preserves content", () => {
            const codeBlocks = result.blocks.filter((b) => b.block_type === BlockType.CODE);
            expect(codeBlocks[0].code?.elements[0].text_run?.content).toContain("console.log");
        });
    });

    describe("rich.md - tables, blockquotes, inline styles", () => {
        const result = mdToBlocks(fixture("rich.md"));

        test("extracts title", () => {
            expect(result.title).toBe("Rich Document");
        });

        test("inline bold", () => {
            const textBlocks = result.blocks.filter((b) => b.block_type === BlockType.TEXT);
            const styledBlock = textBlocks[0]; // "This has **bold**, *italic*..."
            const boldEl = styledBlock.text?.elements.find(
                (el) => el.text_run?.text_element_style?.bold
            );
            expect(boldEl).toBeDefined();
            expect(boldEl?.text_run?.content).toBe("bold");
        });

        test("inline italic", () => {
            const textBlocks = result.blocks.filter((b) => b.block_type === BlockType.TEXT);
            const styledBlock = textBlocks[0];
            const italicEl = styledBlock.text?.elements.find(
                (el) => el.text_run?.text_element_style?.italic
            );
            expect(italicEl).toBeDefined();
            expect(italicEl?.text_run?.content).toBe("italic");
        });

        test("inline strikethrough", () => {
            const textBlocks = result.blocks.filter((b) => b.block_type === BlockType.TEXT);
            const styledBlock = textBlocks[0];
            const strikeEl = styledBlock.text?.elements.find(
                (el) => el.text_run?.text_element_style?.strikethrough
            );
            expect(strikeEl).toBeDefined();
            expect(strikeEl?.text_run?.content).toBe("strikethrough");
        });

        test("inline code", () => {
            const textBlocks = result.blocks.filter((b) => b.block_type === BlockType.TEXT);
            const styledBlock = textBlocks[0];
            const codeEl = styledBlock.text?.elements.find(
                (el) => el.text_run?.text_element_style?.inline_code
            );
            expect(codeEl).toBeDefined();
            expect(codeEl?.text_run?.content).toBe("inline code");
        });

        test("inline link", () => {
            const textBlocks = result.blocks.filter((b) => b.block_type === BlockType.TEXT);
            const linkBlock = textBlocks[1]; // "Here is a [link to Google]..."
            const linkEl = linkBlock.text?.elements.find(
                (el) => el.text_run?.text_element_style?.link
            );
            expect(linkEl).toBeDefined();
            expect(linkEl?.text_run?.text_element_style?.link?.url).toBe("https://google.com");
        });

        test("blockquote blocks", () => {
            const quotes = result.blocks.filter((b) => b.block_type === BlockType.QUOTE);
            expect(quotes.length).toBeGreaterThanOrEqual(2);
        });

        test("table block exists", () => {
            const tables = result.blocks.filter((b) => b.block_type === BlockType.TABLE);
            expect(tables).toHaveLength(1);
            expect(tables[0].table?.property.row_size).toBe(3);
            expect(tables[0].table?.property.column_size).toBe(3);
        });

        test("divider block", () => {
            const dividers = result.blocks.filter((b) => b.block_type === BlockType.DIVIDER);
            expect(dividers).toHaveLength(1);
        });

        test("JSON code block", () => {
            const codeBlocks = result.blocks.filter((b) => b.block_type === BlockType.CODE);
            expect(codeBlocks).toHaveLength(1);
            expect(codeBlocks[0].code?.style?.language).toBe(28); // json
        });
    });

    describe("edge cases", () => {
        test("no H1 uses 'Untitled' as title", () => {
            const result = mdToBlocks("## Just a H2\n\nSome text.");
            expect(result.title).toBe("Untitled");
        });

        test("empty markdown returns empty blocks", () => {
            const result = mdToBlocks("");
            expect(result.blocks).toHaveLength(0);
            expect(result.title).toBe("Untitled");
        });

        test("nested bold and italic", () => {
            const result = mdToBlocks("# T\n\n**Bold with *nested italic* inside**.");
            const textBlocks = result.blocks.filter((b) => b.block_type === BlockType.TEXT);
            expect(textBlocks.length).toBeGreaterThanOrEqual(1);
        });
    });
});
