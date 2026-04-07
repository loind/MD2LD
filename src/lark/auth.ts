const LARK_BASE = "https://open.larksuite.com/open-apis";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let configuredAppId: string | null = null;
let configuredAppSecret: string | null = null;

/**
 * Set Lark app credentials explicitly (from CLI args).
 * Takes priority over environment variables.
 */
export function setCredentials(appId: string, appSecret: string): void {
    configuredAppId = appId;
    configuredAppSecret = appSecret;
    // Invalidate cached token when credentials change
    cachedToken = null;
    tokenExpiresAt = 0;
}

/**
 * Get a tenant_access_token from Lark, with caching and auto-refresh.
 *
 * Token is valid for 2 hours; we refresh 5 minutes early.
 */
export async function getToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && now < tokenExpiresAt) {
        return cachedToken;
    }

    const appId = configuredAppId || process.env.LARK_APP_ID;
    const appSecret = configuredAppSecret || process.env.LARK_APP_SECRET;

    if (!appId || !appSecret) {
        throw new Error(
            "Missing LARK_APP_ID or LARK_APP_SECRET. Pass --app-id/--app-secret or set env vars. See: md2ld --help"
        );
    }

    const resp = await fetch(`${LARK_BASE}/auth/v3/tenant_access_token/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });

    if (!resp.ok) {
        throw new Error(`Lark auth failed: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as {
        code: number;
        msg: string;
        tenant_access_token: string;
        expire: number;
    };

    if (data.code !== 0) {
        throw new Error(`Lark auth error: ${data.code} ${data.msg}`);
    }

    cachedToken = data.tenant_access_token;
    // Refresh 5 minutes before expiry
    tokenExpiresAt = now + (data.expire - 300) * 1000;

    return cachedToken;
}

/** Clear cached token (useful for testing or forced refresh). */
export function clearTokenCache(): void {
    cachedToken = null;
    tokenExpiresAt = 0;
}
