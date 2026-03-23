import { Client, Collection, GatewayIntentBits } from "discord.js"
import type { LavalinkManager } from "lavalink-client"
import loadEvents from "../util/loadEvents.js"
import loadCommands from "../util/loadCommands.js"
import createLavalinkManager from "./LavalinkManager.js"
import type { Command } from "../types/index.js"
import type Logger from "./Logger.js"

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
