import { resolvedBotApiPort } from "./botApiPortEnv.js"

/** Strips every trailing slash from an origin-shaped URL string. */
function stripTrailingSlashes(value: string): string {
    return value.replace(/\/+$/, "")
}

/**
 * Base URL for the bot HTTP server (Express); used by API route proxies and server actions.
 * When `API_PROXY_TARGET` is set it must be a valid `http:` or `https:` origin-only URL with no
 * pathname/query/hash/credentials. Empty/whitespace is treated as unset.
 */
export function getBotApiOrigin(): string | null {
    const raw = process.env.API_PROXY_TARGET?.trim()
    if (!raw) {
        if (process.env.NODE_ENV === "development") {
            return `http://localhost:${resolvedBotApiPort()}`
        }
        return null
    }

    let parsed: URL
    try {
        parsed = new URL(raw)
    } catch {
        // Intentional console usage: this runs during early bootstrap config validation before app loggers initialize.
        console.error(
            "[bot-api-origin] API_PROXY_TARGET is not a valid URL (expected http/https origin)."
        )
        throw new Error("Invalid API_PROXY_TARGET: not a valid URL")
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        // Intentional console usage: this runs during early bootstrap config validation before app loggers initialize.
        console.error("[bot-api-origin] API_PROXY_TARGET must use http: or https: protocol")
        throw new Error("Invalid API_PROXY_TARGET: protocol must be http or https")
    }

    if (
        parsed.pathname !== "/" ||
        parsed.search !== "" ||
        parsed.hash !== "" ||
        parsed.username !== "" ||
        parsed.password !== ""
    ) {
        console.error(
            "[bot-api-origin] API_PROXY_TARGET must be an origin-only URL (no path/query/hash/credentials)."
        )
        throw new Error("Invalid API_PROXY_TARGET: must be an origin-only URL")
    }

    const origin = stripTrailingSlashes(`${parsed.protocol}//${parsed.host}`)
    return origin
}
