const DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS = 10_000
const MAX_UPSTREAM_FETCH_TIMEOUT_MS = 300_000
const DEFAULT_BOT_API_PROXY_TIMEOUT_MS = 4_000
const MAX_BOT_API_PROXY_TIMEOUT_MS = 120_000
const MIN_BOT_API_TIMEOUT_MS = 1_000

/**
 * Clamps an optional upstream fetch timeout for `serverFetchBot`.
 * Non-finite / missing values use 10s; floor is 1s; ceiling is 5 minutes.
 */
export function resolveFetchTimeoutMs(timeoutMs?: number): number {
    if (timeoutMs === undefined) return DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS
    if (!Number.isFinite(timeoutMs)) return DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS
    return Math.min(Math.max(Math.floor(timeoutMs), MIN_BOT_API_TIMEOUT_MS), MAX_UPSTREAM_FETCH_TIMEOUT_MS)
}

/**
 * Reads `BOT_API_PROXY_TIMEOUT_MS` for the Next → bot proxy.
 * Missing/invalid values use 4s; floor is 1s; ceiling is 2 minutes.
 */
export function readBotApiProxyTimeoutMs(
    envValue: string | undefined = process.env.BOT_API_PROXY_TIMEOUT_MS
): number {
    const raw = envValue?.trim()
    if (!raw) return DEFAULT_BOT_API_PROXY_TIMEOUT_MS
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return DEFAULT_BOT_API_PROXY_TIMEOUT_MS
    return Math.min(Math.max(n, MIN_BOT_API_TIMEOUT_MS), MAX_BOT_API_PROXY_TIMEOUT_MS)
}
