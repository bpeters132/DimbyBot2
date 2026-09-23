/** True for hosts that the local bot WS listener uses (plain HTTP, no TLS). */
export function isLoopbackWsHost(hostname: string): boolean {
    const h = hostname.toLowerCase()
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1"
}

/**
 * Local Next (`yarn dev:web`) talks to the bot’s HTTP WebSocket on localhost.
 * `wss://localhost` always fails because that listener has no TLS (production uses a real `wss://` proxy).
 */
export function rewriteLocalDevPlayerWsUrl(wsUrl: string, isDev: boolean): string {
    if (!isDev) return wsUrl
    try {
        const u = new URL(wsUrl)
        if (isLoopbackWsHost(u.hostname) && u.protocol === "wss:") {
            u.protocol = "ws:"
        }
        return u.toString()
    } catch {
        return wsUrl
    }
}

/**
 * Public player WebSocket URL advertised by `GET /api/ws-config`.
 * Empty `configuredUrl` uses a localhost fallback in development and `null` in production.
 * Rejects non-ws(s) schemes, userinfo (credentials in the URL), plaintext `ws:` outside
 * development, and invalid URLs so this unauthenticated route never ships a dangerous target.
 */
export function resolvePublicPlayerWsConfigUrl(opts: {
    configuredUrl: string
    isDev: boolean
    devFallbackPort: number
}): string | null {
    const raw = opts.configuredUrl.trim()
    if (!raw) {
        if (opts.isDev) {
            return `ws://localhost:${opts.devFallbackPort}/ws`
        }
        return null
    }
    try {
        const parsed = new URL(raw)
        if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
            return null
        }
        if (parsed.protocol === "ws:" && !opts.isDev) {
            return null
        }
        if (parsed.username || parsed.password) {
            return null
        }
        return rewriteLocalDevPlayerWsUrl(parsed.toString(), opts.isDev)
    } catch {
        return null
    }
}

/**
 * Protocol for the client fallback URL when `/api/ws-config` is empty.
 * Loopback in development always uses `ws` even if the dashboard tab is `https:`.
 */
export function playerWsFallbackProtocol(opts: {
    isDev: boolean
    pageProtocol: string
    hostname: string
}): "ws" | "wss" {
    if (opts.isDev && isLoopbackWsHost(opts.hostname)) return "ws"
    return opts.pageProtocol === "https:" ? "wss" : "ws"
}
