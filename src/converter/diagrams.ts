import { uploadImageFromBuffer } from "./image-upload";

const KROKI_BASE = "https://kroki.io";

type DiagramType = "mermaid" | "plantuml" | "graphviz" | "ditaa" | "svgbob";

/**
 * Render a diagram using Kroki.io API and return the PNG buffer.
 */
export async function renderDiagram(code: string, type: DiagramType): Promise<Buffer> {
    const resp = await fetch(`${KROKI_BASE}/${type}/png`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: code,
    });

    if (!resp.ok) {
        throw new Error(`Kroki render failed for ${type}: ${resp.status} ${resp.statusText}`);
    }

    return Buffer.from(await resp.arrayBuffer());
}

/**
 * Render a diagram and upload to Lark, returning the file_token.
 */
export async function renderAndUploadDiagram(code: string, type: DiagramType): Promise<string> {
    const pngBuffer = await renderDiagram(code, type);
    return uploadImageFromBuffer(pngBuffer, `diagram-${type}-${Date.now()}.png`);
}

/**
 * Detect diagram type from code fence language.
 *
 * Returns null if not a diagram language.
 */
export function detectDiagramType(lang: string): DiagramType | null {
    const normalized = lang.toLowerCase().trim();
    const map: Record<string, DiagramType> = {
        mermaid: "mermaid",
        plantuml: "plantuml",
        graphviz: "graphviz",
        dot: "graphviz",
        ditaa: "ditaa",
        svgbob: "svgbob",
    };
    return map[normalized] ?? null;
}
