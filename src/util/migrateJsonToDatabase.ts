import fs from "fs"
import path from "path"
import type {
    DownloadsMetadataStore,
    GuildSettingsStore,
    JsonMigrationResult,
    LoggerInterface,
} from "../types/index.js"
import {
    isGuildSettingsTableEmpty,
    replaceGuildSettingsStoreInDatabase,
} from "../repositories/guildSettingsRepository.js"
import {
    isDownloadMetadataTableEmpty,
    replaceDownloadMetadataStoreInDatabase,
} from "../repositories/downloadMetadataRepository.js"

const guildSettingsJsonPath = path.join(process.cwd(), "storage", "guild_settings.json")
const downloadMetadataJsonPath = path.join(process.cwd(), "downloads", ".metadata.json")

function getLogger(loggerInstance: Partial<LoggerInterface> | undefined): LoggerInterface {
    if (
        loggerInstance &&
        typeof loggerInstance.debug === "function" &&
        typeof loggerInstance.info === "function" &&
        typeof loggerInstance.warn === "function" &&
        typeof loggerInstance.error === "function"
    ) {
        const logger = loggerInstance as Partial<LoggerInterface>
        return {
            debug: (text: string, ...args: unknown[]) => logger.debug!(text, ...args),
            info: (text: string, ...args: unknown[]) => logger.info!(text, ...args),
            warn: (text: string, ...args: unknown[]) => logger.warn!(text, ...args),
            error: (text: string, ...args: unknown[]) => logger.error!(text, ...args),
            setDebugEnabled:
                typeof logger.setDebugEnabled === "function"
                    ? logger.setDebugEnabled.bind(logger)
                    : () => {},
            getDebugEnabled:
                typeof logger.getDebugEnabled === "function"
                    ? logger.getDebugEnabled.bind(logger)
                    : () => false,
            getLogFilePath:
                typeof logger.getLogFilePath === "function"
                    ? logger.getLogFilePath.bind(logger)
                    : () => null,
        }
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

function renameJsonAsMigrated(filePath: string, logger: LoggerInterface): void {
    const migratedPath = `${filePath}.migrated`
    fs.renameSync(filePath, migratedPath)
    logger.info(`[JsonMigration] Renamed ${filePath} -> ${migratedPath}`)
}

/** Migrates guild settings JSON into DB when table is empty and source file exists. */
export async function migrateGuildSettings(
    loggerInstance?: Partial<LoggerInterface>
): Promise<JsonMigrationResult> {
    const logger = getLogger(loggerInstance)
    const result: JsonMigrationResult = {
        source: "guildSettings",
        attempted: false,
        skipped: false,
        migratedCount: 0,
        failedCount: 0,
    }

    const tableEmpty = await isGuildSettingsTableEmpty()
    if (!tableEmpty) {
        logger.info("[JsonMigration] Skipping guild settings migration: table is not empty.")
        result.skipped = true
        result.reason = "target-table-not-empty"
        return result
    }

    if (!fs.existsSync(guildSettingsJsonPath)) {
        logger.info("[JsonMigration] Skipping guild settings migration: JSON file does not exist.")
        result.skipped = true
        result.reason = "source-file-missing"
        return result
    }

    result.attempted = true
    logger.info(`[JsonMigration] Starting guild settings migration from ${guildSettingsJsonPath}`)

    try {
        const raw = fs.readFileSync(guildSettingsJsonPath, "utf8")
        const parsed = JSON.parse(raw) as GuildSettingsStore
        const entries = Object.entries(parsed)
        const validEntries: GuildSettingsStore = {}

        for (const [guildId, settings] of entries) {
            if (!guildId || typeof settings !== "object" || settings === null) {
                result.failedCount++
                logger.warn(
                    `[JsonMigration] Skipping invalid guild settings entry for key "${guildId}".`
                )
                continue
            }
            validEntries[guildId] = settings
            logger.debug(`[JsonMigration] Prepared guild settings entry ${guildId} for migration.`)
        }

        const writeResult = await replaceGuildSettingsStoreInDatabase(validEntries)
        result.migratedCount = writeResult.rowsWritten

        if (result.failedCount === 0) {
            renameJsonAsMigrated(guildSettingsJsonPath, logger)
        } else {
            logger.warn(
                "[JsonMigration] Guild settings migration had skipped entries; source JSON was not renamed."
            )
        }

        logger.info(
            `[JsonMigration] Guild settings migration complete. Migrated=${result.migratedCount} Failed=${result.failedCount}`
        )
        return result
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error("[JsonMigration] Guild settings migration failed:", error)
        result.reason = message
        result.failedCount = result.failedCount || 1
        return result
    }
}

/** Migrates downloads metadata JSON into DB when table is empty and source file exists. */
export async function migrateDownloadMetadata(
    loggerInstance?: Partial<LoggerInterface>
): Promise<JsonMigrationResult> {
    const logger = getLogger(loggerInstance)
    const result: JsonMigrationResult = {
        source: "downloadMetadata",
        attempted: false,
        skipped: false,
        migratedCount: 0,
        failedCount: 0,
    }

    const tableEmpty = await isDownloadMetadataTableEmpty()
    if (!tableEmpty) {
        logger.info("[JsonMigration] Skipping download metadata migration: table is not empty.")
        result.skipped = true
        result.reason = "target-table-not-empty"
        return result
    }

    if (!fs.existsSync(downloadMetadataJsonPath)) {
        logger.info(
            "[JsonMigration] Skipping download metadata migration: JSON file does not exist."
        )
        result.skipped = true
        result.reason = "source-file-missing"
        return result
    }

    result.attempted = true
    logger.info(
        `[JsonMigration] Starting download metadata migration from ${downloadMetadataJsonPath}`
    )

    try {
        const raw = fs.readFileSync(downloadMetadataJsonPath, "utf8")
        const parsed = JSON.parse(raw) as DownloadsMetadataStore
        const entries = Object.entries(parsed)
        const validEntries: DownloadsMetadataStore = {}

        for (const [fileName, metadata] of entries) {
            if (!fileName || typeof metadata !== "object" || metadata === null) {
                result.failedCount++
                logger.warn(
                    `[JsonMigration] Skipping invalid download metadata entry for key "${fileName}".`
                )
                continue
            }
            validEntries[fileName] = metadata
            logger.debug(
                `[JsonMigration] Prepared download metadata entry "${fileName}" for migration.`
            )
        }

        const writeResult = await replaceDownloadMetadataStoreInDatabase(validEntries)
        result.migratedCount = writeResult.rowsWritten

        if (result.failedCount === 0) {
            renameJsonAsMigrated(downloadMetadataJsonPath, logger)
        } else {
            logger.warn(
                "[JsonMigration] Download metadata migration had skipped entries; source JSON was not renamed."
            )
        }

        logger.info(
            `[JsonMigration] Download metadata migration complete. Migrated=${result.migratedCount} Failed=${result.failedCount}`
        )
        return result
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error("[JsonMigration] Download metadata migration failed:", error)
        result.reason = message
        result.failedCount = result.failedCount || 1
        return result
    }
}
