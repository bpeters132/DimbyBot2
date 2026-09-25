export type AdminDbCleanupTarget = "sessions" | "verifications" | "all"

const ADMIN_ERRORS_DEFAULT_LIMIT = 100
const ADMIN_ERRORS_MAX_LIMIT = 500
const ADMIN_ERRORS_LIMIT_INT = /^-?\d+$/

/** True when the admin DB cleanup body target is an allowed enum value. */
export function isAdminDbCleanupTarget(value: unknown): value is AdminDbCleanupTarget {
    return value === "sessions" || value === "verifications" || value === "all"
}

/**
 * Parses optional `guildId` for admin error-history listing.
 * Whitespace-only and missing values return `undefined` so the handler lists recent errors
 * instead of filtering the ring for a guild id that can never match.
 */
export function parseAdminErrorsGuildId(raw: string | null): string | undefined {
    const trimmed = raw?.trim()
    return trimmed ? trimmed : undefined
}

/**
 * Parses `limit` for admin error-history listing.
 * Missing/invalid values fall back to 100; results are clamped to 1…500.
 * Rejects partially numeric values (`"250junk"`) and scientific notation (`"1e3"`).
 */
export function parseAdminErrorsLimit(raw: string | null): number {
    if (!raw) return ADMIN_ERRORS_DEFAULT_LIMIT
    const trimmed = raw.trim()
    if (!ADMIN_ERRORS_LIMIT_INT.test(trimmed)) return ADMIN_ERRORS_DEFAULT_LIMIT
    const n = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(n)) return ADMIN_ERRORS_DEFAULT_LIMIT
    return Math.max(1, Math.min(n, ADMIN_ERRORS_MAX_LIMIT))
}
