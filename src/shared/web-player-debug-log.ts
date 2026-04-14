/**
 * Verbose `[web-player]` tracing. Set `WEB_PLAYER_DEBUG=1` on the **bot** process and/or Next
 * (`src/web/.env`) for detailed server logs. Client-side: development builds log at `debug` level
 * without extra env.
 */

const serverDebug =
    typeof process !== "undefined" &&
    (process.env.WEB_PLAYER_DEBUG === "1" || process.env.WEB_PLAYER_DEBUG === "true")

const serverDev =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")

export function webPlayerDebug(...args: unknown[]): void {
    if (!serverDebug && !serverDev) return
    // console: lightweight server-only trace; avoid writeAuditLog (would add I/O / coupling here). webPlayerDebug
    console.log("[web-player]", ...args)
}

/** Noisy paths (e.g. permission denials): only when `WEB_PLAYER_DEBUG=1`. */
export function webPlayerTrace(...args: unknown[]): void {
    if (!serverDebug) return
    // console: gated verbose path only; no writeAuditLog to keep webPlayerTrace zero-deps and synchronous. webPlayerTrace
    console.log("[web-player]", ...args)
}

/** Always emitted (low volume): misconfig, missing bot client for dashboard, subscribe denials. */
export function webPlayerWarn(...args: unknown[]): void {
    // console: misconfig/alerts must surface even when no structured logger is wired; keep webPlayerWarn free of audit pipeline deps. webPlayerWarn
    console.warn("[web-player]", ...args)
}

export function webPlayerDebugEnabled(): boolean {
    return Boolean(serverDebug || serverDev)
}
