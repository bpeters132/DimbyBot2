import fs from "fs"
import path from "path"
import type {
    DownloadsMetadataStore,
    GuildSettingsStore,
    JsonMigrationOptions,
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
import { downloadMetadataStoreKey } from "./downloadMetadataKeys.js"
import { loggerFromPartial } from "./loggerFromPartial.js"

const __dirname = import.meta.dirname

function resolveJsonPath(moduleRelativePath: string, cwdRelativePath: string): string | null {
    const moduleBasedPath = path.join(__dirname, "..", "..", ...moduleRelativePath.split("/"))
    if (fs.existsSync(moduleBasedPath)) {
        return moduleBasedPath
    }
    const cwdBasedPath = path.join(process.cwd(), cwdRelativePath)
    if (fs.existsSync(cwdBasedPath)) {
        return cwdBasedPath
    }
    return null
}

function resolveGuildSettingsJsonPath(): string | null {
    return resolveJsonPath("storage/guild_settings.json", "storage/guild_settings.json")
}

function resolveDownloadMetadataJsonPath(): string | null {
    return resolveJsonPath("downloads/.metadata.json", "downloads/.metadata.json")
}

function renameJsonAsMigrated(filePath: string, logger: LoggerInterface): void {
    const migratedPath = `${filePath}.migrated`
    try {
        fs.renameSync(filePath, migratedPath)
        logger.info(`[JsonMigration] Renamed ${filePath} -> ${migratedPath}`)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn(
            `[JsonMigration] Migration data was written but renaming failed (${filePath} -> ${migratedPath}): ${message}`
        )
    }
}

/** Migrates guild settings JSON into DB when table is empty and source file exists. */
export async function migrateGuildSettings(
    loggerInstance?: Partial<LoggerInterface>,
    options?: JsonMigrationOptions
): Promise<JsonMigrationResult> {
    const logger = loggerFromPartial(loggerInstance)
    const allowPartial = options?.allowPartialMigration === true
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

    const guildSettingsJsonPath = resolveGuildSettingsJsonPath()
    if (!guildSettingsJsonPath || !fs.existsSync(guildSettingsJsonPath)) {
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
        const failedEntries: string[] = []

        for (const [guildId, settings] of entries) {
            if (!guildId || typeof settings !== "object" || settings === null) {
                result.failedCount++
                failedEntries.push(`guild:${String(guildId)}`)
                logger.warn(
                    `[JsonMigration] Skipping invalid guild settings entry for key "${guildId}".`
                )
                continue
            }
            validEntries[guildId] = settings
            logger.debug(`[JsonMigration] Prepared guild settings entry ${guildId} for migration.`)
        }

        if (result.failedCount > 0) {
            if (!allowPartial) {
                logger.error(
                    `[JsonMigration] Guild settings validation failed: ${result.failedCount} entries invalid. Aborting migration.`
                )
                result.skipped = true
                result.reason = "validation-failed"
                result.failedEntries = failedEntries
                return result
            }
            logger.warn(
                `[JsonMigration] Guild settings partial migration: skipping ${result.failedCount} invalid entr(y/ies); continuing with valid rows.`,
                { failedEntries }
            )
            result.partial = true
            result.failedEntries = failedEntries
            result.reason = "partial-validation-failures"
        }

        const writeResult = await replaceGuildSettingsStoreInDatabase(validEntries)
        result.migratedCount = writeResult.rowsUpserted

        renameJsonAsMigrated(guildSettingsJsonPath, logger)

        logger.info(
            `[JsonMigration] Guild settings migration complete. Migrated=${result.migratedCount} Failed=${result.failedCount}`
        )
        return result
    } catch (error: unknown) {
        logger.error("[JsonMigration] Guild settings migration failed:", error)
        throw error
    }
}

/** Migrates downloads metadata JSON into DB when table is empty and source file exists. */
export async function migrateDownloadMetadata(
    loggerInstance?: Partial<LoggerInterface>,
    options?: JsonMigrationOptions
): Promise<JsonMigrationResult> {
    const logger = loggerFromPartial(loggerInstance)
    const allowPartial = options?.allowPartialMigration === true
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

    const downloadMetadataJsonPath = resolveDownloadMetadataJsonPath()
    if (!downloadMetadataJsonPath || !fs.existsSync(downloadMetadataJsonPath)) {
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
        const failedEntries: string[] = []

        for (const [fileName, metadata] of entries) {
            if (!fileName || typeof metadata !== "object" || metadata === null) {
                result.failedCount++
                failedEntries.push(`file:${String(fileName)}`)
                logger.warn(
                    `[JsonMigration] Skipping invalid download metadata entry for key "${fileName}".`
                )
                continue
            }
            const gid =
                typeof metadata.guildId === "string" && metadata.guildId.trim().length > 0
                    ? metadata.guildId.trim()
                    : ""
            const storeKey = gid ? downloadMetadataStoreKey(gid, fileName) : fileName
            validEntries[storeKey] = {
                ...metadata,
                guildId: gid,
            }
            logger.debug(
                `[JsonMigration] Prepared download metadata entry "${storeKey}" for migration.`
            )
        }

        if (result.failedCount > 0) {
            if (!allowPartial) {
                logger.error(
                    `[JsonMigration] Download metadata validation failed: ${result.failedCount} entries invalid. Aborting migration.`
                )
                result.skipped = true
                result.reason = "validation-failed"
                result.failedEntries = failedEntries
                return result
            }
            logger.warn(
                `[JsonMigration] Download metadata partial migration: skipping ${result.failedCount} invalid entr(y/ies); continuing with valid rows.`,
                { failedEntries }
            )
            result.partial = true
            result.failedEntries = failedEntries
            result.reason = "partial-validation-failures"
        }

        const writeResult = await replaceDownloadMetadataStoreInDatabase(validEntries)
        result.migratedCount = writeResult.rowsWritten

        renameJsonAsMigrated(downloadMetadataJsonPath, logger)

        logger.info(
            `[JsonMigration] Download metadata migration complete. Migrated=${result.migratedCount} Failed=${result.failedCount}`
        )
        return result
    } catch (error: unknown) {
        logger.error("[JsonMigration] Download metadata migration failed:", error)
        throw error
    }
}
