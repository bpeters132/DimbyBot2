/**
 * Whether bot HTTP API verbose logging is enabled (`BOT_API_VERBOSE` / `WEB_BOT_API_VERBOSE`).
 * Shared by the Node bot process and the Next dashboard server.
 */
export function isBotApiVerbose(): boolean {
    const v = (process.env.BOT_API_VERBOSE || process.env.WEB_BOT_API_VERBOSE || "").trim()
    return /^(1|true|yes|on)$/i.test(v)
}
