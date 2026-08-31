import { writeAuditLog } from "./audit-log.js"

/**
 * Better Auth options that do not touch the database client (env + OAuth + session cookie policy only). Use
 * {@link getBetterAuthBaseConfig} when wiring `betterAuth(...)` so env is not read at import time.
 *
 * **Runtime split**
 * - **Next.js** (`auth.ts`): OAuth callbacks, sign-in UI, `nextCookies()`, and `getSession` in RSC/server actions.
 *   `BETTER_AUTH_URL` must be the **public dashboard origin** you use in the browser (production:
 *   `https://dashboard.dimbybot.com`; local dev: `http://localhost:3000`). Better Auth `trustedOrigins` follows this
 *   value only — there is no separate trusted-origins env var.
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

const SAFE_ERROR_SNIPPET_MAX = 200

/** Redacts bearer tokens and common OAuth secret patterns from log/error strings. */
export function redactTokenLikeString(s: string): string {
    let out = s
    out = out.replace(/bearer\s+\S+/gi, "Bearer [redacted]")
    out = out.replace(/access_token\s*=\s*\S+/gi, "access_token=[redacted]")
    out = out.replace(/refresh_token\s*=\s*\S+/gi, "refresh_token=[redacted]")
    out = out.replace(/client_secret\s*=\s*\S+/gi, "client_secret=[redacted]")
    // Escape-aware JSON string values so `"p\"ass"` cannot leave a trailing secret suffix.
    out = out.replace(/("access_token"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[redacted]"')
    out = out.replace(/("refresh_token"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[redacted]"')
    out = out.replace(/("client_secret"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[redacted]"')
    return out
}

/** Redacts verbose Discord/token payloads from thrown errors (keys-only for objects, truncated strings). */
export function safeJsonSnippet(value: unknown, maxLen = SAFE_ERROR_SNIPPET_MAX): string {
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
    const redacted = redactTokenLikeString(serialized)
    return redacted.length > maxLen ? `${redacted.slice(0, maxLen)}…` : redacted
}

/** Tokens returned to Better Auth after a successful Discord OAuth refresh. */
export type DiscordOAuthRefreshTokens = {
    accessToken: string
    accessTokenExpiresAt: Date
    refreshToken: string
}

export type ParseDiscordOAuthRefreshFailureReason =
    | "non_object"
    | "missing_access_token"
    | "missing_expires_in"
    | "invalid_expires_at"

export type ParseDiscordOAuthRefreshResult =
    | { ok: true; tokens: DiscordOAuthRefreshTokens }
    | {
          ok: false
          reason: ParseDiscordOAuthRefreshFailureReason
          /** Value safe to pass through {@link safeJsonSnippet} for audit logs. */
          errorSnippet: unknown
      }

/**
 * Parses Discord's OAuth2 token refresh JSON into Better Auth token fields.
 * When Discord omits (or blanks) `refresh_token`, keeps `previousRefreshToken` so
 * subsequent guild fetches do not lose the stored refresh credential.
 */
export function parseDiscordOAuthRefreshPayload(
    parsed: unknown,
    previousRefreshToken: string,
    nowMs: number = Date.now()
): ParseDiscordOAuthRefreshResult {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, reason: "non_object", errorSnippet: parsed }
    }
    const data = parsed as Record<string, unknown>
    const accessRaw = typeof data.access_token === "string" ? data.access_token.trim() : ""
    if (!accessRaw) {
        return { ok: false, reason: "missing_access_token", errorSnippet: parsed }
    }
    if (
        typeof data.expires_in !== "number" ||
        !Number.isFinite(data.expires_in) ||
        data.expires_in <= 0
    ) {
        return { ok: false, reason: "missing_expires_in", errorSnippet: parsed }
    }
    const expiresAtMs = nowMs + data.expires_in * 1000
    if (!Number.isFinite(expiresAtMs)) {
        return { ok: false, reason: "invalid_expires_at", errorSnippet: parsed }
    }
    const accessTokenExpiresAt = new Date(expiresAtMs)
    if (Number.isNaN(accessTokenExpiresAt.getTime())) {
        return { ok: false, reason: "invalid_expires_at", errorSnippet: parsed }
    }
    const nextRefresh = typeof data.refresh_token === "string" ? data.refresh_token.trim() : ""
    return {
        ok: true,
        tokens: {
            accessToken: accessRaw,
            accessTokenExpiresAt,
            refreshToken: nextRefresh.length > 0 ? nextRefresh : previousRefreshToken,
        },
    }
}

/**
 * Better Auth options shared by Next and the bot. Call this when constructing `betterAuth(...)`, not at module load,
 * so `next build` can import route modules without real `BETTER_AUTH_*` / Discord env (values are read on first use).
 */
export function getBetterAuthBaseConfig() {
    const betterAuthSecret = getRequiredEnv("BETTER_AUTH_SECRET")
    const betterAuthUrl = getRequiredEnv("BETTER_AUTH_URL")
    const discordOAuthClientId = getRequiredEnv("CLIENT_ID")
    const discordOAuthClientSecret = getRequiredEnv("DISCORD_CLIENT_SECRET")
    /** Match web and bot: derive from public dashboard URL, not NODE_ENV (bot container often omits it). */
    const useSecureCookies = betterAuthUrl.startsWith("https://")

    return {
        secret: betterAuthSecret,
        baseURL: betterAuthUrl,
        trustedOrigins: [betterAuthUrl],
        /** Failed OAuth/API auth redirects here instead of `/` (avoids login UI on callback error paths). */
        onAPIError: {
            errorURL: "/auth/error",
        },
        advanced: {
            useSecureCookies,
            defaultCookieAttributes: {
                secure: useSecureCookies,
                httpOnly: true,
                sameSite: "lax" as const,
            },
        },
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
                        const parsedTokens = parseDiscordOAuthRefreshPayload(parsed, refreshToken)
                        if (parsedTokens.ok === false) {
                            const messageByReason: Record<
                                ParseDiscordOAuthRefreshFailureReason,
                                string
                            > = {
                                non_object: "Discord OAuth refresh returned non-object JSON",
                                missing_access_token: "Discord OAuth refresh missing access_token",
                                missing_expires_in: "Discord OAuth refresh missing expires_in",
                                invalid_expires_at: "Discord OAuth refresh invalid expires_in",
                            }
                            const message = messageByReason[parsedTokens.reason]
                            logRefreshFailure({
                                message,
                                httpStatus: tokenResponse.status,
                                errorSnippet: parsedTokens.errorSnippet,
                            })
                            throw new Error(
                                `${message} (${tokenResponse.status}): ${safeJsonSnippet(parsedTokens.errorSnippet)}`
                            )
                        }
                        return parsedTokens.tokens
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
}
