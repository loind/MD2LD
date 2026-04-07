import { getToken } from "./auth";

const LARK_BASE = "https://open.larksuite.com/open-apis";

interface UploadResponse {
    code: number;
    msg: string;
    data: {
        file_token: string;
    };
}

/**
 * Upload an image buffer to Lark and return the file_token.
 *
 * Uses the media upload API for docx images.
 */
export async function uploadImage(
    buffer: Buffer,
    filename: string,
    parentType: "docx_image" = "docx_image",
): Promise<string> {
    const token = await getToken();

    const formData = new FormData();
    formData.append("file_name", filename);
    formData.append("parent_type", parentType);
    formData.append("parent_node", "");
    formData.append("size", String(buffer.byteLength));
    formData.append("file", new Blob([buffer]), filename);

    const resp = await fetch(`${LARK_BASE}/drive/v1/medias/upload_all`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    const data = (await resp.json()) as UploadResponse;
    if (data.code !== 0) {
        throw new Error(`Failed to upload image: ${data.code} ${data.msg}`);
    }

    return data.data.file_token;
}
