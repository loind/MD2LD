import { readFileSync, existsSync } from "fs";

const LARK_BASE = "https://open.larksuite.com/open-apis";

// --- Tenant token state ---
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let configuredAppId: string | null = null;
let configuredAppSecret: string | null = null;
let credentialsLocked = false;

// --- User token state ---
let userTokenFile: string | null = null;
let cachedUserToken: string | null = null;
let userTokenExpiresAt = 0;

interface UserTokenFile {
    access_token: string;
    refresh_token?: string;
    access_token_expires_at: number; // unix timestamp (seconds)
    refresh_token_expires_at?: number;
    open_id?: string;
}

/**
 * Set the path to a user token file (JSON with access_token + expiry).
 * When set, getToken() returns the user_access_token instead of tenant token.
 */
export function setUserTokenFile(filePath: string): void {
    if (!existsSync(filePath)) {
        throw new Error(`User token file not found: ${filePath}`);
    }
    userTokenFile = filePath;
    cachedUserToken = null;
    userTokenExpiresAt = 0;
}

/**
 * Read and cache user_access_token from the token file.
 * Refreshes automatically via the Lark OAuth refresh_token API if expired.
 */
async function getUserToken(): Promise<string> {
    const now = Date.now();
    if (cachedUserToken && now < userTokenExpiresAt) {
        return cachedUserToken;
    }

    if (!userTokenFile || !existsSync(userTokenFile)) {
        throw new Error("User token file not configured or missing.");
    }

    const content = readFileSync(userTokenFile, "utf-8");
    const data: UserTokenFile = JSON.parse(content);

    if (!data.access_token) {
        throw new Error("User token file missing access_token field.");
    }

    const expiresAtMs = data.access_token_expires_at * 1000;

    // If token is still valid (with 5-min buffer), use it
    if (now < expiresAtMs - 300_000) {
        cachedUserToken = data.access_token;
        userTokenExpiresAt = expiresAtMs - 300_000;
        return cachedUserToken;
    }

    // Token expired — try refresh if we have app credentials and refresh_token
    if (data.refresh_token && configuredAppId && configuredAppSecret) {
        const refreshed = await refreshUserToken(data.refresh_token);
        if (refreshed) {
            return refreshed;
        }
    }

    throw new Error(
        "User access token expired. Run lark-token-renew to get a fresh token."
    );
}

/**
 * Refresh user_access_token via Lark OAuth refresh API.
 * Updates the token file on success.
 */
async function refreshUserToken(refreshToken: string): Promise<string | null> {
    try {
        const resp = await fetch(`${LARK_BASE}/authen/v1/oidc/refresh_access_token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${await getTenantToken()}`,
            },
            body: JSON.stringify({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }),
        });

        if (!resp.ok) return null;

        const result = (await resp.json()) as {
            code: number;
            data?: {
                access_token: string;
                refresh_token: string;
                expires_in: number;
                refresh_expires_in: number;
                open_id: string;
            };
        };

        if (result.code !== 0 || !result.data) return null;

        const now = Date.now();
        const newData: UserTokenFile = {
            access_token: result.data.access_token,
            refresh_token: result.data.refresh_token,
            access_token_expires_at: (now + result.data.expires_in * 1000) / 1000,
            refresh_token_expires_at: (now + result.data.refresh_expires_in * 1000) / 1000,
            open_id: result.data.open_id,
        };

        // Write updated tokens back to file
        const { writeFileSync } = await import("fs");
        writeFileSync(userTokenFile!, JSON.stringify(newData, null, 2), "utf-8");

        cachedUserToken = newData.access_token;
        userTokenExpiresAt = now + (result.data.expires_in - 300) * 1000;

        return cachedUserToken;
    } catch {
        return null;
    }
}

/**
 * Set Lark app credentials explicitly.
 *
 * Once set, credentials are locked for the process lifetime to prevent
 * credential cross-contamination in concurrent scenarios. Subsequent
 * calls with different credentials will throw.
 */
export function setCredentials(appId: string, appSecret: string): void {
    if (credentialsLocked) {
        // Allow re-setting with identical values (idempotent)
        if (configuredAppId === appId && configuredAppSecret === appSecret) {
            return;
        }
        throw new Error("Credentials already configured. Restart the process to use different credentials.");
    }
    configuredAppId = appId;
    configuredAppSecret = appSecret;
    credentialsLocked = true;
    cachedToken = null;
    tokenExpiresAt = 0;
}

/**
 * Get an access token for Lark API calls.
 *
 * Priority: user_access_token (if configured) > tenant_access_token.
 * User tokens have broader scopes (docx:document:create, drive:file:upload, etc.)
 * that are unavailable to tenant tokens.
 */
export async function getToken(): Promise<string> {
    if (userTokenFile) {
        return getUserToken();
    }
    return getTenantToken();
}

/**
 * Get a tenant_access_token from Lark, with caching and auto-refresh.
 * Token is valid for 2 hours; we refresh 5 minutes early.
 */
async function getTenantToken(): Promise<string> {
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

/** Returns which token type is active. */
export function getTokenType(): "user" | "tenant" {
    return userTokenFile ? "user" : "tenant";
}

/** Clear cached token and unlock credentials (for testing only). */
export function clearTokenCache(): void {
    cachedToken = null;
    tokenExpiresAt = 0;
    configuredAppId = null;
    configuredAppSecret = null;
    credentialsLocked = false;
    userTokenFile = null;
    cachedUserToken = null;
    userTokenExpiresAt = 0;
}
