/**
 * Resolves the Prisma datasource URL for CLI (`migrate`, `generate`) and `prisma.config.ts`.
 *
 * Prefers `DATABASE_URL`. When that is unset (typical host-side local dev — Compose
 * must not get a localhost URL in the shared root `.env`), builds a host-local URL
 * from `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`. Last resort is a dummy
 * local URL so `prisma generate` still runs in build contexts without a database.
 */
export function resolvePrismaDatasourceUrl(env: NodeJS.ProcessEnv = process.env): string {
    const explicit = env.DATABASE_URL?.trim()
    if (explicit) {
        return explicit
    }

    const user = env.POSTGRES_USER?.trim()
    const database = env.POSTGRES_DB?.trim()
    if (user && database) {
        const encodedUser = encodeURIComponent(user)
        const password = encodeURIComponent(env.POSTGRES_PASSWORD ?? "")
        const encodedDatabase = encodeURIComponent(database)
        // Compose / CI inject DATABASE_URL with hostname postgres-db. If that is missing
        // inside a production container, do not fall back to localhost (that is the host CLI).
        const host =
            env.POSTGRES_HOST?.trim() ||
            (env.NODE_ENV === "production" ? "postgres-db" : "localhost")
        const port = env.POSTGRES_PORT?.trim() || "5432"
        return `postgresql://${encodedUser}:${password}@${host}:${port}/${encodedDatabase}`
    }

    return "postgresql://postgres:postgres@localhost:5432/postgres"
}
