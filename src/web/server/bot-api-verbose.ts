/**
 * Set `BOT_API_VERBOSE=1` or `WEB_BOT_API_VERBOSE=1` on the **Next** process to log every server-side
 * call to the bot HTTP API (no cookie or body contents).
 */

export function isBotApiVerbose(): boolean {
    const v = (process.env.BOT_API_VERBOSE ?? process.env.WEB_BOT_API_VERBOSE ?? "").trim()
    return /^(1|true|yes|on)$/i.test(v)
}

/** Structured one-line log for the Next server terminal. */
export function logBotApiVerbose(message: string, data?: Record<string, unknown>): void {
    if (!isBotApiVerbose()) return
    if (data && Object.keys(data).length > 0) {
        console.log(`[bot-api:next] ${message}`, data)
    } else {
        console.log(`[bot-api:next] ${message}`)
    }
}
