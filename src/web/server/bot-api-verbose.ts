/**
 * Set `BOT_API_VERBOSE=1` or `WEB_BOT_API_VERBOSE=1` on the **Next** process to log every server-side
 * call to the bot HTTP API (no cookie or body contents).
 */

import { isBotApiVerbose } from "../../util/botApiVerboseEnv.js"

export { isBotApiVerbose }

function redactSecrets(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
    if (!value || typeof value !== "object") {
        return value
    }

    if (seen.has(value as object)) {
        return "[Circular]"
    }
    seen.add(value as object)

    const redactedKeys = new Set([
        "token",
        "secret",
        "password",
        "apikey",
        "api_key",
        "authorization",
        "access_token",
        "auth",
        "credentials",
        "config",
        "cookie",
        "set-cookie",
    ])

    if (Array.isArray(value)) {
        return value.map((item) => redactSecrets(item, seen))
    }

    const clone: Record<string, unknown> = { ...(value as Record<string, unknown>) }
    for (const [key, entry] of Object.entries(clone)) {
        if (redactedKeys.has(key.toLowerCase())) {
            clone[key] = "[REDACTED]"
            continue
        }
        if (entry && typeof entry === "object") {
            clone[key] = redactSecrets(entry, seen)
        }
    }

    return clone
}

/** Structured one-line log for the Next server terminal. */
export function logBotApiVerbose(message: string, data?: Record<string, unknown>): void {
    if (!isBotApiVerbose()) return
    if (data && Object.keys(data).length > 0) {
        console.log(`[bot-api:next] ${message}`, redactSecrets(data))
    } else {
        console.log(`[bot-api:next] ${message}`)
    }
}
