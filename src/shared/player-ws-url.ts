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
