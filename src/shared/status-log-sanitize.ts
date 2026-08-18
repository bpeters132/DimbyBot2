import { shouldRedactKey } from "./bot-api-verbose-redact.js"
import { sanitizeErrorText } from "./sanitize-log-text.js"

/** Host / DSN / connection-ish keys that shouldRedactKey does not cover. */
const SENSITIVE_KEY = /\b(?:password|secret|token|uri|connectionString|connection|host|headers)\b/i
const SANITIZE_MAX_DEPTH = 10

function shouldRedactStatusKey(key: string): boolean {
    return shouldRedactKey(key) || SENSITIVE_KEY.test(key)
}

/** True when a string looks like a host, URL/DSN, or host:port (must not appear in status logs). */
export function stringLooksLikeHostOrDsn(value: string): boolean {
    if (/:\/\//.test(value)) {
        return true
    }
    if (/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(value)) {
        return true
    }
    if (/[.][a-z0-9-]{2,}:\d{2,5}\b/i.test(value)) {
        return true
    }
    // Bare dotted hostname (db.internal) and single-label host:port (localhost:5432).
    if (
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
            value.trim()
        )
    ) {
        return true
    }
    if (/\blocalhost:\d{2,5}\b/i.test(value)) {
        return true
    }
    return false
}

/**
 * Recursively sanitizes structured error/status payloads for audit logs.
 * Sensitive keys and host/DSN-looking strings become `"[redacted]"`.
 */
export function sanitizeParsedForLog(
    value: unknown,
    depth = 0,
    visited = new WeakSet<object>()
): unknown {
    if (depth > SANITIZE_MAX_DEPTH) {
        return "[too_deep]"
    }
    if (Array.isArray(value)) {
        if (visited.has(value)) {
            return "[circular]"
        }
        visited.add(value)
        return value.map((item) => sanitizeParsedForLog(item, depth + 1, visited))
    }
    if (value && typeof value === "object") {
        const objectValue = value as Record<string, unknown>
        if (visited.has(objectValue)) {
            return "[circular]"
        }
        visited.add(objectValue)
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(objectValue)) {
            if (shouldRedactStatusKey(k)) {
                out[k] = "[redacted]"
                continue
            }
            if (typeof v === "string") {
                if (stringLooksLikeHostOrDsn(v)) {
                    out[k] = "[redacted]"
                } else {
                    out[k] = sanitizeErrorText(v, 800)
                }
                continue
            }
            out[k] = sanitizeParsedForLog(v, depth + 1, visited)
        }
        return out
    }
    if (typeof value === "string") {
        if (stringLooksLikeHostOrDsn(value)) {
            return "[redacted]"
        }
        return sanitizeErrorText(value, 800)
    }
    return value
}

/** Safe `{ name, message }` for status-page audit logging when a probe throws. */
export function sanitizeErrorForLog(error: unknown): { name?: string; message: string } {
    if (!(error instanceof Error)) {
        return { message: "[redacted]" }
    }
    try {
        const parsed = JSON.parse(error.message) as Record<string, unknown>
        const safeCopy = sanitizeParsedForLog(parsed) as Record<string, unknown>
        return { name: error.name, message: JSON.stringify(safeCopy) }
    } catch {
        if (stringLooksLikeHostOrDsn(error.message)) {
            return { name: error.name, message: "[redacted]" }
        }
        return {
            name: error.name,
            message: sanitizeErrorText(error.message, 800),
        }
    }
}
