import prismaClientPkg from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { spawn } from "child_process"
import type { LoggerInterface } from "../types/index.js"
import type { PrismaClient as PrismaClientType } from "@prisma/client"

const { PrismaClient } = prismaClientPkg

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl || databaseUrl.trim() === "") {
    throw new Error(
        "DATABASE_URL environment variable is required but not set. Please configure DATABASE_URL before starting the application."
    )
}

const adapter = new PrismaPg({
    connectionString: databaseUrl,
})
const prisma = new PrismaClient({ adapter })

function getLogger(loggerInstance?: Partial<LoggerInterface>): LoggerInterface {
    if (
        loggerInstance &&
        typeof loggerInstance.debug === "function" &&
        typeof loggerInstance.info === "function" &&
        typeof loggerInstance.warn === "function" &&
        typeof loggerInstance.error === "function"
    ) {
        const logger = loggerInstance as LoggerInterface
        return logger
    }

    return {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        setDebugEnabled: () => {},
        getDebugEnabled: () => false,
        getLogFilePath: () => null,
    }
}

/** Returns the process-wide Prisma client singleton. */
export function getPrismaClient(): PrismaClientType {
    return prisma
}

/** Connects to the database and fails fast if it cannot be reached. */
export async function initializeDatabaseConnection(
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = getLogger(loggerInstance)
    logger.info("[Database] Connecting to database...")
    await prisma.$connect()
    await prisma.$queryRaw`SELECT 1`
    logger.info("[Database] Database connection verified.")
}

/** Runs `prisma migrate deploy` from the project root with an explicit schema path. */
export async function runPrismaMigrateDeploy(
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = getLogger(loggerInstance)
    logger.info("[Database] Running Prisma migrations (deploy)...")

    const yarnCommand = process.platform === "win32" ? "yarn.cmd" : "yarn"
    const child = spawn(
        yarnCommand,
        ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
        {
            cwd: process.cwd(),
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        }
    )

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString()
        stdout += text
        logger.info(`[Database][migrate] ${text.trimEnd()}`)
    })

    child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString()
        stderr += text
        logger.warn(`[Database][migrate] ${text.trimEnd()}`)
    })

    await new Promise<void>((resolve, reject) => {
        child.once("error", (error) => {
            reject(error)
        })
        child.once("close", (code) => {
            if (code === 0) {
                resolve()
                return
            }
            const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n")
            reject(new Error(`prisma migrate deploy failed with exit code ${code}\n${combined}`))
        })
    })

    logger.info("[Database] Prisma migrations applied successfully.")
}

/** Attempts to close the Prisma connection gracefully. */
export async function disconnectDatabase(loggerInstance?: Partial<LoggerInterface>): Promise<void> {
    const logger = getLogger(loggerInstance)
    try {
        await prisma.$disconnect()
        logger.info("[Database] Database connection closed.")
    } catch (error: unknown) {
        logger.warn("[Database] Failed to disconnect cleanly:", error)
    }
}
