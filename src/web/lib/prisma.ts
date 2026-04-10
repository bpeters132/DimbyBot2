import prismaClientPkg from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const { PrismaClient } = prismaClientPkg

const databaseUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres"
const adapter = new PrismaPg({
    connectionString: databaseUrl,
})

const prisma = new PrismaClient({ adapter })

export function getWebPrismaClient() {
    return prisma
}
