export type AdminDbCleanupTarget = "sessions" | "verifications" | "all"

const ADMIN_ERRORS_DEFAULT_LIMIT = 100
const ADMIN_ERRORS_MAX_LIMIT = 500

/** True when the admin DB cleanup body target is an allowed enum value. */
export function isAdminDbCleanupTarget(value: unknown): value is AdminDbCleanupTarget {
    return value === "sessions" || value === "verifications" || value === "all"
}

/**
 * Parses `limit` for admin error-history listing.
 * Missing/invalid values fall back to 100; results are clamped to 1…500.
 */
export function parseAdminErrorsLimit(raw: string | null): number {
    if (!raw) return ADMIN_ERRORS_DEFAULT_LIMIT
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return ADMIN_ERRORS_DEFAULT_LIMIT
    return Math.max(1, Math.min(n, ADMIN_ERRORS_MAX_LIMIT))
}
