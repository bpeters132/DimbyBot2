/**
 * Set `BOT_API_VERBOSE=1` or `WEB_BOT_API_VERBOSE=1` on the **Next** process to log every server-side
 * call to the bot HTTP API (no cookie or body contents).
 */

import { isBotApiVerbose } from "../../util/botApiVerboseEnv.js"

export { isBotApiVerbose }

const redactedKeysLower = new Set([
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
    "x-api-key",
    "client-secret",
    "client_secret",
])

const redactedKeysNormalized = new Set(
    Array.from(redactedKeysLower).map((k) => k.replace(/[^a-z0-9]+/g, "")),
)

/** Lowercases and strips non-alphanumerics for fuzzy header / key matching. */
function normalizeSecretKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function shouldRedactKey(key: string): boolean {
    const lower = key.toLowerCase()
    if (redactedKeysLower.has(lower)) return true
    const norm = normalizeSecretKey(key)
    if (redactedKeysNormalized.has(norm)) return true
    if (
        /(^|[^a-z0-9])(token|secret|password|apikey|credential|authorization|bearer|cookie)([^a-z0-9]|$)/i.test(
            key,
        )
    ) {
        return true
    }
    if (
        /(apitoken|accesstoken|refreshtoken|idtoken|apisecret|clientsecret|privatekey|sessionid)/i.test(
            norm,
        )
    ) {
        return true
    }
    return false
}

function redactSecrets(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
    if (!value || typeof value !== "object") {
        return value
    }

    if (seen.has(value as object)) {
        return "[Circular]"
    }
    seen.add(value as object)

    if (Array.isArray(value)) {
        return value.map((item) => redactSecrets(item, seen))
    }

    const clone: Record<string, unknown> = { ...(value as Record<string, unknown>) }
    for (const [key, entry] of Object.entries(clone)) {
        if (shouldRedactKey(key)) {
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
