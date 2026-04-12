/** Strips every trailing slash from an origin-shaped URL string. */
function stripTrailingSlashes(value: string): string {
    return value.replace(/\/+$/, "")
}

/**
 * Base URL for the bot HTTP server (Express); used by API route proxies and server actions.
 * When `API_PROXY_TARGET` is set it must be a valid `http:` or `https:` URL; only the origin
 * (`protocol//host[:port]`) is retained. Empty/whitespace is treated as unset.
 */
export function getBotApiOrigin(): string | null {
    const raw = process.env.API_PROXY_TARGET?.trim()
    if (!raw) {
        if (process.env.NODE_ENV === "development") return "http://localhost:3001"
        return null
    }

    let parsed: URL
    try {
        parsed = new URL(raw)
    } catch {
        console.error(
            "[bot-api-origin] API_PROXY_TARGET is not a valid URL (expected http/https origin):",
            raw
        )
        throw new Error("Invalid API_PROXY_TARGET: not a valid URL")
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        console.error(
            "[bot-api-origin] API_PROXY_TARGET must use http: or https:, got:",
            parsed.protocol
        )
        throw new Error("Invalid API_PROXY_TARGET: protocol must be http or https")
    }

    if (!parsed.host) {
        console.error("[bot-api-origin] API_PROXY_TARGET is missing a host:", raw)
        throw new Error("Invalid API_PROXY_TARGET: missing host")
    }

    const origin = stripTrailingSlashes(`${parsed.protocol}//${parsed.host}`)
    return origin
}
