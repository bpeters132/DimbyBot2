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

function classifyMigrateFailure(text: string): { tag: string; category: string } {
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
function prismaP3009ResolutionHint(text: string): string {
    const m = text.match(/The `([^`]+)` migration/m)
    const name = m?.[1] ?? "<migration_name>"
    return (
        ` Prisma P3009 resolution: inspect _prisma_migrations and the DB for that migration, fix any partial state, then run ONE of: ` +
        `yarn prisma migrate resolve --applied ${name} (if the migration SQL outcome is already correct), ` +
        `or yarn prisma migrate resolve --rolled-back ${name} (if nothing from that migration should remain and you will re-run deploy). ` +
        `Docs: https://pris.ly/d/migrate-resolve`
    )
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
    const migrateEnv = { ...process.env }
    if (typeof migrateEnv.DATABASE_URL === "string") {
        migrateEnv.DATABASE_URL = migrateEnv.DATABASE_URL.trim()
    }
    const child = spawn(
        yarnCommand,
        ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
        {
            cwd: process.cwd(),
            env: migrateEnv,
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
                logger.warn(
                    `[Database][migrate] [signal] prisma migrate deploy terminated by signal ${signalText}`
                )
                reject(
                    new Error(
                        `[signal] prisma migrate deploy failed due to signal ${signalText}. Output: ${redactedCombined || "(no output)"}`
                    )
                )
                return
            }
            const classified = classifyMigrateFailure(redactedCombined)
            logger.warn(
                `[Database][migrate] ${classified.tag} prisma migrate deploy exited with code ${code} (${classified.category})`
            )
            const p3009Hint =
                classified.tag === "[p3009-failed-migration]"
                    ? prismaP3009ResolutionHint(redactedCombined)
                    : ""
            reject(
                new Error(
                    `${classified.tag} prisma migrate deploy failed with exit code ${code} (${classified.category}). Output: ${redactedCombined || "(no output)"}${p3009Hint}`
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
