import { sanitizeErrorText } from "./sanitize-log-text.js"

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
    "configsecret",
    "dbconfig",
    "client_config",
    "cookie",
    "set-cookie",
    "x-api-key",
    "client-secret",
    "client_secret",
    "private_key",
    "private-key",
])

const redactedKeysNormalized = new Set(
    Array.from(redactedKeysLower).map((k) => k.replace(/[^a-z0-9]+/g, ""))
)

/** Lowercases and strips non-alphanumerics for fuzzy header / key matching. */
export function normalizeSecretKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/**
 * True when an object / header key should be fully redacted in bot-api verbose logs.
 * Matches exact names, fuzzy normalized forms, and token/secret/password substrings.
 */
export function shouldRedactKey(key: string): boolean {
    const lower = key.toLowerCase()
    if (redactedKeysLower.has(lower)) return true
    if (/(^|[^a-z0-9])config[^a-z0-9]*(secret|token|password|key)([^a-z0-9]|$)/i.test(key)) {
        return true
    }
    const norm = normalizeSecretKey(key)
    if (redactedKeysNormalized.has(norm)) return true
    if (
        /(^|[^a-z0-9])(token|secret|password|apikey|credential|authorization|bearer|cookie)([^a-z0-9]|$)/i.test(
            key
        )
    ) {
        return true
    }
    if (
        /(apitoken|accesstoken|refreshtoken|idtoken|apisecret|clientsecret|privatekey|sessionid)/i.test(
            norm
        )
    ) {
        return true
    }
    return false
}

/**
 * Deep-clones log payloads while redacting secret keys and sanitizing string values.
 * Circular references become `"[Circular]"`.
 */
export function redactSecrets(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
    if (value === null || value === undefined) {
        return value
    }
    if (typeof value === "string") {
        return sanitizeErrorText(value, 4000)
    }
    if (typeof value !== "object") {
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
        if (typeof entry === "string") {
            clone[key] = sanitizeErrorText(entry, 4000)
            continue
        }
        if (entry && typeof entry === "object") {
            clone[key] = redactSecrets(entry, seen)
        }
    }

    return clone
}
