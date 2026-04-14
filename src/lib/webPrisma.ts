import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const DEFAULT_DEV_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres"

const globalForPrisma = globalThis as unknown as {
    __webPrismaClient?: InstanceType<typeof PrismaClient>
}

function createWebPrismaClient(): InstanceType<typeof PrismaClient> {
    const databaseUrl = process.env.DATABASE_URL?.trim()
    if (!databaseUrl) {
        if (process.env.NODE_ENV !== "development") {
            throw new Error("DATABASE_URL is required outside development environments.")
        }
        if (process.env.ALLOW_DEV_DATABASE_FALLBACK !== "true") {
            throw new Error(
                "DATABASE_URL is required. In development you may set ALLOW_DEV_DATABASE_FALLBACK=true to use the built-in local default (see .env.example)."
            )
        }
    }
    const adapter = new PrismaPg({
        connectionString: databaseUrl || DEFAULT_DEV_DATABASE_URL,
    })
    return new PrismaClient({ adapter })
}

/** Lazily creates (and caches) the web Prisma client on first call. */
export function getWebPrismaClient() {
    if (!globalForPrisma.__webPrismaClient) {
        globalForPrisma.__webPrismaClient = createWebPrismaClient()
    }
    return globalForPrisma.__webPrismaClient
}
