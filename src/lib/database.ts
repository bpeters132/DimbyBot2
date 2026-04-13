import prismaClientPkg from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { spawn } from "child_process"
import type { LoggerInterface } from "../types/index.js"
import type { PrismaClient as PrismaClientType } from "@prisma/client"

const { PrismaClient } = prismaClientPkg

let prisma: PrismaClientType | undefined

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

function sanitizeMigrateOutput(text: string): string {
    return text
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]")
        .replace(/(password|passwd|pwd)\s*[=:]\s*[^\s"'`]+/gi, "$1=[REDACTED]")
        .replace(/(token|secret|apikey|api[_-]?key)\s*[=:]\s*[^\s"'`]+/gi, "$1=[REDACTED]")
        .replace(/Bearer\s+[^\s"'`]+/gi, "Bearer [REDACTED]")
}

/** Returns the process-wide Prisma client singleton after {@link initializeDatabaseConnection}. */
export function getPrismaClient(): PrismaClientType {
    if (!prisma) {
        throw new Error(
            "Database connection has not been initialized. Call initializeDatabaseConnection() first."
        )
    }
    return prisma
}

/** Connects to the database and fails fast if it cannot be reached. */
export async function initializeDatabaseConnection(
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = getLogger(loggerInstance)
    const databaseUrl = process.env.DATABASE_URL?.trim()
    if (!databaseUrl) {
        throw new Error(
            "DATABASE_URL environment variable is required but not set. Please configure DATABASE_URL before starting the application."
        )
    }
    if (!prisma) {
        const adapter = new PrismaPg({
            connectionString: databaseUrl,
        })
        prisma = new PrismaClient({ adapter })
    }
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
    let stdoutLineBuf = ""
    let stderrLineBuf = ""

    child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString()
        stdout += text
        stdoutLineBuf += text
        const lines = stdoutLineBuf.split("\n")
        stdoutLineBuf = lines.pop() ?? ""
        for (const line of lines) {
            logger.info(`[Database][migrate] ${sanitizeMigrateOutput(line)}`)
        }
    })

    child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString()
        stderr += text
        stderrLineBuf += text
        const lines = stderrLineBuf.split("\n")
        stderrLineBuf = lines.pop() ?? ""
        for (const line of lines) {
            logger.warn(`[Database][migrate] ${sanitizeMigrateOutput(line)}`)
        }
    })

    await new Promise<void>((resolve, reject) => {
        child.once("error", (error) => {
            reject(error)
        })
        child.once("close", (code, signal) => {
            if (stdoutLineBuf.trim()) {
                logger.info(`[Database][migrate] ${sanitizeMigrateOutput(stdoutLineBuf).trimEnd()}`)
            }
            if (stderrLineBuf.trim()) {
                logger.warn(`[Database][migrate] ${sanitizeMigrateOutput(stderrLineBuf).trimEnd()}`)
            }
            if (code === 0) {
                resolve()
                return
            }
            const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n")
            const redactedCombined = sanitizeMigrateOutput(combined)
            logger.debug(
                `[Database][migrate] Full migrate output on failure (${redactedCombined.length} chars):\n${redactedCombined}`
            )
            if (code === null) {
                const signalText = signal ?? "unknown"
                logger.debug(
                    `[Database][migrate] prisma migrate deploy terminated by signal ${signalText}`
                )
                reject(
                    new Error(
                        `prisma migrate deploy failed due to signal ${signalText} (see debug logs for full output).`
                    )
                )
                return
            }
            reject(
                new Error(
                    `prisma migrate deploy failed with exit code ${code} (see debug logs for full output).`
                )
            )
        })
    })

    logger.info("[Database] Prisma migrations applied successfully.")
}

/** Attempts to close the Prisma connection gracefully. */
export async function disconnectDatabase(loggerInstance?: Partial<LoggerInterface>): Promise<void> {
    const logger = getLogger(loggerInstance)
    if (!prisma) {
        return
    }
    try {
        await prisma.$disconnect()
        logger.info("[Database] Database connection closed.")
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn("[Database] Failed to disconnect cleanly:", message)
    }
}
