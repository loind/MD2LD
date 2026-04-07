/** Lark Document Block types */

export interface TextElement {
    text_run?: {
        content: string;
        text_element_style?: TextElementStyle;
    };
    mention_doc?: {
        token: string;
        obj_type: number;
    };
}

export interface TextElementStyle {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    inline_code?: boolean;
    link?: {
        url: string;
    };
}

export interface TextStyle {
    align?: 1 | 2 | 3; // 1=left, 2=center, 3=right
    folded?: boolean;
    language?: number;
}

export interface LarkBlock {
    block_type: number;
    text?: {
        style?: TextStyle;
        elements: TextElement[];
    };
    heading1?: { style?: TextStyle; elements: TextElement[] };
    heading2?: { style?: TextStyle; elements: TextElement[] };
    heading3?: { style?: TextStyle; elements: TextElement[] };
    heading4?: { style?: TextStyle; elements: TextElement[] };
    heading5?: { style?: TextStyle; elements: TextElement[] };
    heading6?: { style?: TextStyle; elements: TextElement[] };
    bullet?: { style?: TextStyle; elements: TextElement[] };
    ordered?: { style?: TextStyle; elements: TextElement[] };
    quote?: { style?: TextStyle; elements: TextElement[] };
    code?: { style?: TextStyle; elements: TextElement[] };
    image?: { token: string; width?: number; height?: number };
    table?: {
        cells: string[];
        property: {
            row_size: number;
            column_size: number;
            column_width?: number[];
            merge_info?: Array<{ row_span: number; col_span: number }>;
            header_row?: boolean;
        };
    };
    divider?: Record<string, never>;
    children?: string[];
}

/** Block type constants matching Lark API */
export const BlockType = {
    PAGE: 1,
    TEXT: 2,
    HEADING1: 3,
    HEADING2: 4,
    HEADING3: 5,
    HEADING4: 6,
    HEADING5: 7,
    HEADING6: 8,
    BULLET: 12,
    ORDERED: 13,
    CODE: 14,
    QUOTE: 15,
    DIVIDER: 22,
    IMAGE: 27,
    TABLE: 31,
    TABLE_CELL: 32,
} as const;

/** Language codes for code blocks in Lark */
export const LANG_MAP: Record<string, number> = {
    plaintext: 1,
    abap: 2,
    ada: 3,
    apache: 4,
    apex: 5,
    assembly: 6,
    bash: 7,
    sh: 7,
    shell: 7,
    csharp: 8,
    "c#": 8,
    cpp: 9,
    "c++": 9,
    c: 10,
    cobol: 11,
    css: 12,
    coffeescript: 13,
    d: 14,
    dart: 15,
    delphi: 16,
    django: 17,
    dockerfile: 18,
    erlang: 19,
    fortran: 20,
    foxpro: 21,
    go: 22,
    golang: 22,
    groovy: 23,
    html: 24,
    htmlbars: 25,
    http: 26,
    haskell: 27,
    json: 28,
    java: 29,
    javascript: 30,
    js: 30,
    julia: 31,
    kotlin: 32,
    latex: 33,
    lisp: 34,
    lua: 36,
    matlab: 38,
    makefile: 39,
    markdown: 40,
    nginx: 41,
    objectivec: 43,
    "objective-c": 43,
    php: 46,
    perl: 47,
    powershell: 49,
    prolog: 50,
    protobuf: 52,
    python: 54,
    py: 54,
    r: 55,
    ruby: 57,
    rb: 57,
    rust: 58,
    rs: 58,
    sas: 59,
    scss: 60,
    sql: 61,
    scala: 62,
    scheme: 63,
    swift: 65,
    typescript: 67,
    ts: 67,
    tsx: 67,
    jsx: 30,
    vbnet: 69,
    xml: 71,
    yaml: 72,
    yml: 72,
    cmake: 73,
    diff: 76,
    gams: 77,
    ocaml: 79,
    pascal: 80,
    perl6: 81,
    elixir: 83,
    toml: 85,
};

export interface ConvertResult {
    title: string;
    blocks: LarkBlock[];
}
