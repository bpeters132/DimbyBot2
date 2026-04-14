import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const defaultDevDatabaseUrl = "postgresql://postgres:postgres@localhost:5432/postgres"
const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl && process.env.NODE_ENV !== "development") {
    throw new Error("DATABASE_URL is required outside development environments.")
}

const globalForPrisma = globalThis as unknown as {
    __webPrismaClient?: InstanceType<typeof PrismaClient>
}

function createWebPrismaClient(): InstanceType<typeof PrismaClient> {
    const adapter = new PrismaPg({
        connectionString: databaseUrl || defaultDevDatabaseUrl,
    })
    return new PrismaClient({ adapter })
}

const prisma = globalForPrisma.__webPrismaClient ?? createWebPrismaClient()

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.__webPrismaClient = prisma
}

export function getWebPrismaClient() {
    return prisma
}
