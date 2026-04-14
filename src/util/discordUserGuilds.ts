import { createHash } from "node:crypto"

/** Identifies this app to Discord REST (recommended for debugging; not the bot gateway user-agent). */
const DISCORD_USER_API_UA = "DimbyBotDashboard/1.0 (OAuth user token)"

/** Attempts including the first request; keeps dashboard guild loads from failing on transient 429s. */
const GUILD_LIST_MAX_ATTEMPTS = 4
/** Upper bound on a single wait so one bad payload cannot stall the server unbounded. */
const GUILD_LIST_MAX_RETRY_WAIT_MS = 60_000
const GUILD_LIST_MIN_RETRY_WAIT_MS = 500
const GUILD_LIST_REQUEST_TIMEOUT_MS = 10_000
/** Wall-clock cap for the whole retry loop (per token fetch), including waits between attempts. */
const GUILD_LIST_TOTAL_ATTEMPT_BUDGET_MS = Math.min(
    60_000,
    GUILD_LIST_REQUEST_TIMEOUT_MS * GUILD_LIST_MAX_ATTEMPTS
)
/** +/- fraction applied to retry waits so concurrent clients do not retry in lockstep after 429s. */
const GUILD_LIST_RETRY_JITTER_RATIO = 0.15

function jitteredDelayMs(baseMs: number): number {
    const factor = 1 + (Math.random() * 2 - 1) * GUILD_LIST_RETRY_JITTER_RATIO
    const ms = Math.round(baseMs * factor)
    return Math.min(Math.max(ms, 1), GUILD_LIST_MAX_RETRY_WAIT_MS)
}

/** Re-use recent successful OAuth guild fetches to avoid bursty `/users/@me/guilds` calls (e.g. dashboard ↔ guild). */
const GUILD_LIST_SUCCESS_CACHE_TTL_MS = 120_000

export type DiscordUserGuild = { id: string; name: string; icon: string | null }

export type FetchUserGuildsResult =
    | { ok: true; guilds: DiscordUserGuild[] }
    | { ok: false; status: number; message: string }

type SuccessCacheEntry = { expiresAt: number; guilds: DiscordUserGuild[] }

/** Hash OAuth tokens for map keys — avoids retaining raw secrets in memory. */
function accessTokenCacheKey(accessToken: string): string {
    return createHash("sha256").update(accessToken, "utf8").digest("hex")
}

const MAX_GUILD_LIST_CACHE_ENTRIES = 500

const successCache = new Map<string, SuccessCacheEntry>()
const inflight = new Map<string, Promise<FetchUserGuildsResult>>()

function evictOldestCacheEntry(): void {
    const iter = successCache.keys()
    const result = iter.next()
    if (!result.done) {
        successCache.delete(result.value)
    }
}

const SUCCESS_CACHE_SWEEP_MS = 60_000
const sweepInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of successCache.entries()) {
        if (now > entry.expiresAt) {
            successCache.delete(key)
        }
    }
}, SUCCESS_CACHE_SWEEP_MS)
if (typeof sweepInterval.unref === "function") {
    sweepInterval.unref()
}

function isDiscordUserGuildRow(value: unknown): value is DiscordUserGuild {
    if (!value || typeof value !== "object") {
        return false
    }
    const row = value as { id?: unknown; name?: unknown; icon?: unknown }
    if (typeof row.id !== "string" || typeof row.name !== "string") {
        return false
    }
    return row.icon === null || typeof row.icon === "string"
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function guildListExponentialBackoffMs(attempt: number): number {
    const exp = GUILD_LIST_MIN_RETRY_WAIT_MS * 2 ** Math.max(0, attempt - 1)
    return Math.min(exp, GUILD_LIST_MAX_RETRY_WAIT_MS)
}

function readSuccessCache(accessToken: string): DiscordUserGuild[] | null {
    const key = accessTokenCacheKey(accessToken)
    const entry = successCache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
        successCache.delete(key)
        return null
    }
    return entry.guilds
}

function writeSuccessCache(accessToken: string, guilds: DiscordUserGuild[]): void {
    const key = accessTokenCacheKey(accessToken)
    while (successCache.size >= MAX_GUILD_LIST_CACHE_ENTRIES && !successCache.has(key)) {
        evictOldestCacheEntry()
    }
    successCache.set(key, {
        expiresAt: Date.now() + GUILD_LIST_SUCCESS_CACHE_TTL_MS,
        guilds,
    })
}

/**
 * Discord 429 responses include `Retry-After` (seconds) and/or a JSON body with `retry_after` (seconds).
 */
function discordRetryAfterMs(response: Response, bodyText: string): number {
    const header = response.headers.get("retry-after")
    if (header) {
        const sec = Number.parseFloat(header.trim())
        if (Number.isFinite(sec) && sec >= 0) {
            return Math.min(Math.ceil(sec * 1000), GUILD_LIST_MAX_RETRY_WAIT_MS)
        }
    }
    try {
        const parsed = JSON.parse(bodyText) as { retry_after?: number }
        if (typeof parsed.retry_after === "number" && Number.isFinite(parsed.retry_after)) {
            return Math.min(Math.ceil(parsed.retry_after * 1000), GUILD_LIST_MAX_RETRY_WAIT_MS)
        }
    } catch {
        /* ignore */
    }
    return Math.min(2000, GUILD_LIST_MAX_RETRY_WAIT_MS)
}

async function fetchDiscordUserGuildsOnce(accessToken: string): Promise<FetchUserGuildsResult> {
    const loopStartedAt = Date.now()
    for (let attempt = 1; attempt <= GUILD_LIST_MAX_ATTEMPTS; attempt++) {
        if (Date.now() - loopStartedAt > GUILD_LIST_TOTAL_ATTEMPT_BUDGET_MS) {
            return {
                ok: false,
                status: 0,
                message: "Timed out loading Discord guilds after repeated attempts.",
            }
        }

        let response: Response
        const controller = new AbortController()
        const timeoutHandle = setTimeout(() => controller.abort(), GUILD_LIST_REQUEST_TIMEOUT_MS)
        try {
            response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "User-Agent": DISCORD_USER_API_UA,
                },
                signal: controller.signal,
            })
        } catch (error: unknown) {
            if (attempt < GUILD_LIST_MAX_ATTEMPTS) {
                const waitMs = guildListExponentialBackoffMs(attempt)
                const sleepMs = jitteredDelayMs(waitMs)
                if (Date.now() - loopStartedAt + sleepMs > GUILD_LIST_TOTAL_ATTEMPT_BUDGET_MS) {
                    return {
                        ok: false,
                        status: 0,
                        message: "Timed out loading Discord guilds after repeated attempts.",
                    }
                }
                await delay(sleepMs)
                continue
            }
            if (error instanceof Error && error.name === "AbortError") {
                return {
                    ok: false,
                    status: 0,
                    message: "Timed out reaching Discord while loading guilds.",
                }
            }
            return { ok: false, status: 0, message: "Network error reaching Discord." }
        } finally {
            clearTimeout(timeoutHandle)
        }

        if (response.ok) {
            let parsed: unknown
            try {
                parsed = await response.json()
            } catch {
                return { ok: false, status: 0, message: "invalid-discord-guilds-response" }
            }
            if (!Array.isArray(parsed)) {
                return { ok: false, status: 0, message: "invalid-discord-guilds-response" }
            }
            const guilds: DiscordUserGuild[] = []
            for (const item of parsed) {
                if (!isDiscordUserGuildRow(item)) {
                    return { ok: false, status: 0, message: "invalid-discord-guilds-response" }
                }
                guilds.push({
                    id: item.id,
                    name: item.name,
                    icon: item.icon ?? null,
                })
            }
            return { ok: true, guilds }
        }

        if (response.status === 429) {
            const bodyText = await response.text()
            if (attempt < GUILD_LIST_MAX_ATTEMPTS) {
                const exp = guildListExponentialBackoffMs(attempt)
                const waitMs = Math.max(discordRetryAfterMs(response, bodyText), exp)
                const sleepMs = jitteredDelayMs(waitMs)
                if (Date.now() - loopStartedAt + sleepMs > GUILD_LIST_TOTAL_ATTEMPT_BUDGET_MS) {
                    return {
                        ok: false,
                        status: 0,
                        message: "Timed out loading Discord guilds after repeated attempts.",
                    }
                }
                await delay(sleepMs)
                continue
            }
            return {
                ok: false,
                status: 429,
                message: "Discord rate limited this request repeatedly; try again in a minute.",
            }
        }

        if (response.status === 401) {
            return {
                ok: false,
                status: 401,
                message:
                    "Discord rejected the access token (expired or revoked). Sign out and sign in with Discord again.",
            }
        }
        if (response.status === 403) {
            return {
                ok: false,
                status: 403,
                message:
                    "Discord denied this request. Re-authorize with the `guilds` scope (sign out and sign in again).",
            }
        }
        return {
            ok: false,
            status: response.status,
            message: `Discord API returned HTTP ${response.status}.`,
        }
    }

    return {
        ok: false,
        status: 429,
        message: "Discord rate limited this request repeatedly; try again in a minute.",
    }
}

/**
 * Calls `GET /users/@me/guilds` with the user's OAuth access token (needs `guilds` scope).
 * Coalesces concurrent calls, caches successes briefly, and retries on 429 using Discord's suggested delay.
 *
 * Lives under `src/util/` so `tsc` emits it to `dist/util/` for the bot process (the bot API must not rely on
 * stale `dist/web/` output excluded from the root TypeScript project).
 */
export async function fetchDiscordUserGuilds(accessToken: string): Promise<FetchUserGuildsResult> {
    const cached = readSuccessCache(accessToken)
    if (cached) {
        return { ok: true, guilds: cached }
    }

    const cacheKey = accessTokenCacheKey(accessToken)
    const existing = inflight.get(cacheKey)
    if (existing) {
        return existing
    }

    const run = (async () => {
        const result = await fetchDiscordUserGuildsOnce(accessToken)
        if (result.ok) {
            writeSuccessCache(accessToken, result.guilds)
        }
        return result
    })().finally(() => {
        inflight.delete(cacheKey)
    })

    inflight.set(cacheKey, run)
    return run
}
