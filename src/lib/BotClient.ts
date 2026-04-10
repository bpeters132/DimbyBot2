import { Client, Collection, GatewayIntentBits } from "discord.js"
import type { LavalinkManager } from "lavalink-client"
import loadEvents from "../util/loadEvents.js"
import loadCommands from "../util/loadCommands.js"
import createLavalinkManager from "./LavalinkManager.js"
import type { Command } from "../types/index.js"
import type Logger from "./Logger.js"
import { initializeDatabaseConnection, runPrismaMigrateDeploy } from "./database.js"
import { migrateDownloadMetadata, migrateGuildSettings } from "../util/migrateJsonToDatabase.js"
import { initializeGuildSettingsStore } from "../util/saveControlChannel.js"
import { initializeDownloadMetadataStore } from "../util/downloadMetadataStore.js"

export default class BotClient extends Client {
    logger: Logger
    lavalink: LavalinkManager
    commands: Collection<string, Command>

    constructor(loggerInstance: Logger) {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
            ],
        })

        if (!loggerInstance) {
            throw new Error("Logger instance must be provided to BotClient constructor.")
        }
        this.logger = loggerInstance

        this.info("BotClient constructor: Logger attached.")

        this.debug("BotClient constructor: Initializing Lavalink manager...")
        this.lavalink = createLavalinkManager(this)
        this.debug("BotClient constructor: Lavalink manager initialized.")

        this.commands = new Collection<string, Command>()

        this.info("BotClient constructor: Finished.")
    }

    info(text: string, ...args: unknown[]) {
        this.logger.info(text, ...args)
    }

    error(text: string, ...args: unknown[]) {
        this.logger.error(text, ...args)
    }

    warn(text: string, ...args: unknown[]) {
        this.logger.warn(text, ...args)
    }

    debug(text: string, ...args: unknown[]) {
        this.logger.debug(text, ...args)
    }

    async start(token: string | undefined = process.env.BOT_TOKEN): Promise<void> {
        this.info("BotClient start: Attempting to log in...")
        if (!token) {
            this.error("BotClient start: Bot token is missing. Ensure BOT_TOKEN is set in .env")
            throw new Error("Bot token is required.")
        }
        try {
            await initializeDatabaseConnection(this)
        } catch (err: unknown) {
            this.error("BotClient start: Database connection failed; startup aborted.", err)
            throw err
        }
        try {
            await runPrismaMigrateDeploy(this)
        } catch (err: unknown) {
            this.error("BotClient start: Prisma migration deploy failed; startup aborted.", err)
            throw err
        }
        try {
            const guildSettingsMigration = await migrateGuildSettings(this)
            this.info(
                `BotClient start: Guild settings migration status attempted=${guildSettingsMigration.attempted} skipped=${guildSettingsMigration.skipped} migrated=${guildSettingsMigration.migratedCount} failed=${guildSettingsMigration.failedCount}`
            )
            if (guildSettingsMigration.failedCount > 0) {
                throw new Error(
                    `Guild settings migration failed: ${guildSettingsMigration.failedCount} entries failed. Reason: ${guildSettingsMigration.reason || "unknown"}`
                )
            }
            const downloadsMigration = await migrateDownloadMetadata(this)
            this.info(
                `BotClient start: Download metadata migration status attempted=${downloadsMigration.attempted} skipped=${downloadsMigration.skipped} migrated=${downloadsMigration.migratedCount} failed=${downloadsMigration.failedCount}`
            )
            if (downloadsMigration.failedCount > 0) {
                throw new Error(
                    `Download metadata migration failed: ${downloadsMigration.failedCount} entries failed. Reason: ${downloadsMigration.reason || "unknown"}`
                )
            }
        } catch (err: unknown) {
            this.error("BotClient start: JSON-to-database migration failed; startup aborted.", err)
            throw err
        }
        try {
            await initializeGuildSettingsStore(this)
            await initializeDownloadMetadataStore(this)
            this.info(
                "BotClient start: Runtime settings/metadata caches initialized from database."
            )
        } catch (err: unknown) {
            this.error("BotClient start: Failed to initialize runtime caches from database.", err)
            throw err
        }
        this.info("BotClient start: Loading events and commands...")
        try {
            await loadEvents(this)
            this.debug("BotClient start: All events loaded successfully.")
        } catch (err: unknown) {
            this.error("BotClient start: Error loading events:", err)
            throw err
        }
        try {
            await loadCommands(this)
            this.debug("BotClient start: All commands loaded successfully.")
        } catch (err: unknown) {
            this.error("BotClient start: Error loading commands:", err)
            throw err
        }
        try {
            await this.login(token)
            this.info("BotClient start: Logged in successfully.")
        } catch (err) {
            this.error("BotClient start: Login failed:", err)
            throw err
        }
    }
}