/** Base URL for the bot HTTP server (Express); used by API route proxies and server actions. */
export function getBotApiOrigin(): string | null {
    const fromEnv = process.env.API_PROXY_TARGET?.trim()
    if (fromEnv) return fromEnv.replace(/\/$/, "")
    if (process.env.NODE_ENV === "development") return "http://localhost:3001"
    return null
}
