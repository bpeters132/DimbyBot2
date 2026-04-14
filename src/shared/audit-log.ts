export type AuditLogLevel = "debug" | "info" | "warn" | "error"

const SENSITIVE_KEY_PATTERN =
    /^(authorization|auth|token|access_token|refresh_token|apikey|api_key|apiKey|x-api-key|secret|client_secret|cookie|cookies|set-cookie|password)$/i
const OMITTED_KEY_PATTERN = /^(headers|body|request|response)$/i
const MAX_DEPTH = 4
const MAX_STRING_LENGTH = 600

function sanitizeAuditDetails(value: unknown, depth = 0): unknown {
    if (depth > MAX_DEPTH) return "[truncated-depth]"
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message.slice(0, MAX_STRING_LENGTH),
            stack: value.stack ? value.stack.slice(0, MAX_STRING_LENGTH) : undefined,
        }
    }
    if (typeof value === "string") {
        return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value
    }
    if (typeof value !== "object" || value === null) {
        return value
    }
    if (Array.isArray(value)) {
        return value.slice(0, 20).map((entry) => sanitizeAuditDetails(entry, depth + 1))
    }

    const sanitized: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(value)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
            sanitized[key] = "[redacted]"
            continue
        }
        if (OMITTED_KEY_PATTERN.test(key)) {
            sanitized[key] = "[omitted]"
            continue
        }
        sanitized[key] = sanitizeAuditDetails(raw, depth + 1)
    }
    return sanitized
}

/**
 * Minimal centralized audit logger for web runtime paths that need consistent observability output.
 * `details` MUST already be safe for logs: never pass raw tokens, secrets, cookies, or full configs.
 * Pass small, sanitized objects only; this function applies defensive redaction/truncation as a backup.
 */
export function writeAuditLog(
    level: AuditLogLevel,
    event: string,
    message: string,
    details?: unknown
): void {
    const prefix = `[audit:${event}] ${message}`
    const safeDetails = sanitizeAuditDetails(details)
    if (level === "error") {
        if (details !== undefined) console.error(prefix, safeDetails)
        else console.error(prefix)
        return
    }
    if (level === "warn") {
        if (details !== undefined) console.warn(prefix, safeDetails)
        else console.warn(prefix)
        return
    }
    if (level === "debug") {
        if (details !== undefined) console.debug(prefix, safeDetails)
        else console.debug(prefix)
        return
    }
    if (details !== undefined) console.log(prefix, safeDetails)
    else console.log(prefix)
}
