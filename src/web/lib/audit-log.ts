export type AuditLogLevel = "info" | "warn" | "error"

/**
 * Minimal centralized audit logger for web runtime paths that need consistent observability output.
 */
export function writeAuditLog(
    level: AuditLogLevel,
    event: string,
    message: string,
    details?: unknown
): void {
    const prefix = `[audit:${event}] ${message}`
    if (level === "error") {
        console.error(prefix, details)
        return
    }
    if (level === "warn") {
        console.warn(prefix, details)
        return
    }
    console.log(prefix, details)
}
