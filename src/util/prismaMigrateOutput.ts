/** Redacts credentials that Prisma migrate stdout/stderr may echo (DATABASE_URL, tokens). */
export function sanitizeMigrateOutput(text: string): string {
    return text
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]")
        .replace(/(password|passwd|pwd)\s*[=:]\s*[^\s"'`]+/gi, "$1=[REDACTED]")
        .replace(/(token|secret|apikey|api[_-]?key)\s*[=:]\s*[^\s"'`]+/gi, "$1=[REDACTED]")
        .replace(/Bearer\s+[^\s"'`]+/gi, "Bearer [REDACTED]")
}

/** Classifies migrate failure text into a short operator-facing tag + category. */
export function classifyMigrateFailure(text: string): { tag: string; category: string } {
    const lower = text.toLowerCase()
    if (
        /\bp1001\b/i.test(text) ||
        /\beconnrefused\b/i.test(text) ||
        lower.includes("connection refused") ||
        lower.includes("can't reach database server")
    ) {
        return { tag: "[network]", category: "database connectivity failure" }
    }
    if (/\beacces\b/i.test(text) || lower.includes("permission denied")) {
        return { tag: "[permission]", category: "permission failure" }
    }
    // Before generic "schema" matching — Prisma prints "Prisma schema loaded from …" on every run.
    if (/\bp3009\b/i.test(text) || lower.includes("migrate found failed migrations")) {
        return {
            tag: "[p3009-failed-migration]",
            category:
                "a migration is marked failed in _prisma_migrations; Prisma will not apply newer migrations until it is resolved",
        }
    }
    if (
        /\bp2002\b/i.test(text) ||
        /\bp2003\b/i.test(text) ||
        /\bp3006\b/i.test(text) ||
        /\bp3018\b/i.test(text) ||
        lower.includes("constraint") ||
        /\bduplicate key\b/i.test(text) ||
        /\bunique constraint\b/i.test(text)
    ) {
        return { tag: "[schema-conflict]", category: "schema or constraint failure" }
    }
    return { tag: "[exit-code]", category: "migration command failure" }
}

/**
 * Short operator hint when deploy fails with P3009 (must be appended after redaction; no secrets).
 * @see https://www.prisma.io/docs/orm/prisma-migrate/workflows/troubleshooting-development
 */
export function prismaP3009ResolutionHint(text: string): string {
    const m = text.match(/The `([^`]+)` migration/m)
    const name = m?.[1] ?? "<migration_name>"
    return (
        ` Prisma P3009 resolution: inspect _prisma_migrations and the DB for that migration, fix any partial state, then run ONE of: ` +
        `yarn prisma migrate resolve --applied ${name} (if the migration SQL outcome is already correct), ` +
        `or yarn prisma migrate resolve --rolled-back ${name} (if nothing from that migration should remain and you will re-run deploy). ` +
        `Docs: https://pris.ly/d/migrate-resolve`
    )
}
