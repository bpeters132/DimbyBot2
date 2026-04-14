import { writeAuditLog } from "../lib/audit-log.js"

/**
 * Better Auth options that do not touch the database client (env + OAuth + session cookie policy only).
 *
 * **Runtime split**
 * - **Next.js** (`auth.ts`): OAuth callbacks, sign-in UI, `nextCookies()`, and `getSession` in RSC/server actions.
 *   `BETTER_AUTH_URL` must be the **dashboard origin** (e.g. `http://localhost:3000`).
 * - **Bot / Express** (`auth-node.ts`): Validates the same session cookies against the same Postgres when handling
 *   `/api/guilds/*` and `/ws`. No Next.js runtime; do not import `better-auth/next-js` there.
 *
 * Both use the same `BETTER_AUTH_SECRET`, `DATABASE_URL`, and Discord OAuth app — one identity store, two HTTP stacks.
 *
 * OAuth tokens on `Account` rows are sensitive: use a TLS `DATABASE_URL` in production and least-privilege DB roles.
 */
function getRequiredEnv(
    name: "CLIENT_ID" | "DISCORD_CLIENT_SECRET" | "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL"
): string {
    const value = process.env[name]?.trim()
    if (!value) {
        throw new Error(`${name} is required for auth configuration.`)
    }
    return value
}

const betterAuthSecret = getRequiredEnv("BETTER_AUTH_SECRET")
const betterAuthUrl = getRequiredEnv("BETTER_AUTH_URL")
const discordOAuthClientId = getRequiredEnv("CLIENT_ID")
const discordOAuthClientSecret = getRequiredEnv("DISCORD_CLIENT_SECRET")

const SAFE_ERROR_SNIPPET_MAX = 200

function redactTokenLikeString(s: string): string {
    let out = s
    if (/bearer\s+\S+/i.test(out)) {
        out = out.replace(/bearer\s+\S+/gi, "Bearer [redacted]")
    }
    if (/access_token\s*=\s*\S+/i.test(out)) {
        out = out.replace(/access_token\s*=\s*\S+/gi, "access_token=[redacted]")
    }
    if (/refresh_token\s*=\s*\S+/i.test(out)) {
        out = out.replace(/refresh_token\s*=\s*\S+/gi, "refresh_token=[redacted]")
    }
    if (/client_secret\s*=\s*\S+/i.test(out)) {
        out = out.replace(/client_secret\s*=\s*\S+/gi, "client_secret=[redacted]")
    }
    if (/"access_token"\s*:\s*"[^"]*"/i.test(out)) {
        out = out.replace(/"access_token"\s*:\s*"[^"]*"/gi, '"access_token":"[redacted]"')
    }
    if (/"refresh_token"\s*:\s*"[^"]*"/i.test(out)) {
        out = out.replace(/"refresh_token"\s*:\s*"[^"]*"/gi, '"refresh_token":"[redacted]"')
    }
    return out
}

/** Redacts verbose Discord/token payloads from thrown errors (keys-only for objects, truncated strings). */
function safeJsonSnippet(value: unknown, maxLen = SAFE_ERROR_SNIPPET_MAX): string {
    if (value === null || value === undefined) {
        return String(value)
    }
    if (typeof value === "string") {
        const redacted = redactTokenLikeString(value)
        return redacted.length > maxLen ? `${redacted.slice(0, maxLen)}…` : redacted
    }
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
        const keys = Object.keys(value as Record<string, unknown>).slice(0, 16)
        return keys.length > 0 ? `{ keys: ${keys.join(", ")} }` : "{}"
    }
    let serialized: string
    try {
        serialized = JSON.stringify(value)
    } catch {
        serialized = "[unserializable]"
    }
    return serialized.length > maxLen ? `${serialized.slice(0, maxLen)}…` : serialized
}

export const betterAuthBaseConfig = {
    secret: betterAuthSecret,
    baseURL: betterAuthUrl,
    trustedOrigins: [betterAuthUrl],
    /** Encrypt OAuth tokens at rest; uses the same `secret` as signing (see Better Auth `account` plugin). */
    account: {
        encryptOAuthTokens: true,
    },
    socialProviders: {
        discord: {
            clientId: discordOAuthClientId,
            clientSecret: discordOAuthClientSecret,
            scope: ["identify", "guilds"],
            /**
             * Discord often omits `refresh_token` in refresh responses. Better Auth otherwise may clear the stored
             * refresh token and break `getAccessToken` → `/users/@me/guilds` after the first expiry.
             */
            refreshAccessToken: async (refreshToken: string) => {
                const controller = new AbortController()
                const timeoutHandle = setTimeout(() => controller.abort(), 10_000)
                const logRefreshFailure = (payload: {
                    message: string
                    httpStatus?: number
                    errorSnippet: unknown
                }) => {
                    writeAuditLog("warn", "DISCORD_OAUTH_REFRESH_FAILURE", payload.message, {
                        event: "discord_oauth_refresh_failure",
                        httpStatus: payload.httpStatus,
                        errorSnippet: safeJsonSnippet(payload.errorSnippet),
                    })
                }
                try {
                    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({
                            client_id: discordOAuthClientId,
                            client_secret: discordOAuthClientSecret,
                            grant_type: "refresh_token",
                            refresh_token: refreshToken,
                        }),
                        signal: controller.signal,
                    })
                    if (!tokenResponse.ok) {
                        const text = await tokenResponse.text()
                        logRefreshFailure({
                            message: "Discord OAuth refresh returned non-OK response",
                            httpStatus: tokenResponse.status,
                            errorSnippet: text,
                        })
                        throw new Error(
                            `Discord OAuth refresh failed (${tokenResponse.status}): ${safeJsonSnippet(text)}`
                        )
                    }
                    let parsed: unknown
                    try {
                        parsed = await tokenResponse.json()
                    } catch {
                        logRefreshFailure({
                            message: "Discord OAuth refresh returned invalid JSON",
                            httpStatus: tokenResponse.status,
                            errorSnippet: "invalid-json",
                        })
                        throw new Error(
                            `Discord OAuth refresh returned invalid JSON (${tokenResponse.status})`
                        )
                    }
                    if (!parsed || typeof parsed !== "object") {
                        logRefreshFailure({
                            message: "Discord OAuth refresh returned non-object JSON",
                            httpStatus: tokenResponse.status,
                            errorSnippet: parsed,
                        })
                        throw new Error(
                            `Discord OAuth refresh returned non-object JSON (${tokenResponse.status}): ${safeJsonSnippet(parsed)}`
                        )
                    }
                    const data = parsed as Record<string, unknown>
                    if (typeof data.access_token !== "string" || data.access_token.length === 0) {
                        logRefreshFailure({
                            message: "Discord OAuth refresh missing access_token",
                            httpStatus: tokenResponse.status,
                            errorSnippet: parsed,
                        })
                        throw new Error(
                            `Discord OAuth refresh missing access_token (${tokenResponse.status}): ${safeJsonSnippet(parsed)}`
                        )
                    }
                    if (
                        typeof data.expires_in !== "number" ||
                        !Number.isFinite(data.expires_in) ||
                        data.expires_in <= 0
                    ) {
                        logRefreshFailure({
                            message: "Discord OAuth refresh missing expires_in",
                            httpStatus: tokenResponse.status,
                            errorSnippet: parsed,
                        })
                        throw new Error(
                            `Discord OAuth refresh missing expires_in (${tokenResponse.status}): ${safeJsonSnippet(parsed)}`
                        )
                    }
                    return {
                        accessToken: data.access_token,
                        accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
                        refreshToken:
                            typeof data.refresh_token === "string" && data.refresh_token.length > 0
                                ? data.refresh_token
                                : refreshToken,
                    }
                } catch (error: unknown) {
                    if (error instanceof Error && error.name === "AbortError") {
                        writeAuditLog(
                            "warn",
                            "DISCORD_OAUTH_REFRESH_FAILURE",
                            "Discord OAuth refresh timed out",
                            {
                                event: "discord_oauth_refresh_failure",
                                httpStatus: undefined,
                                errorSnippet: safeJsonSnippet("AbortError"),
                            }
                        )
                        throw new Error("Discord OAuth refresh timed out", { cause: error })
                    }
                    throw error
                } finally {
                    clearTimeout(timeoutHandle)
                }
            },
        },
    },
    session: {
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60,
        },
    },
}
