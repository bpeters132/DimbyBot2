import { Client, GatewayIntentBits } from "discord.js"
import loadEvents from "../util/loadEvents.js"
import loadCommands from "../util/loadCommands.js"
import createLavalinkManager from "./LavalinkManager.js"

class BotClient extends Client {
  /**
   * @param {import('./Logger.js').default} loggerInstance The logger instance to use.
   */
  constructor(loggerInstance) {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    })

    // Attach the provided logger instance
    if (!loggerInstance) {
      throw new Error("Logger instance must be provided to BotClient constructor.")
    }
    this.logger = loggerInstance

    this.info("BotClient constructor: Logger attached.")

    // Build lavalink manager
    this.debug("BotClient constructor: Initializing Lavalink manager...")
    this.lavalink = createLavalinkManager(this)
    this.debug("BotClient constructor: Lavalink manager initialized.")

    // Load all event listeners
    this.info("BotClient constructor: Loading events...")
    loadEvents(this)
      .then(() => {
        this.debug("BotClient constructor: All events loaded successfully.")
      })
      .catch((err) => {
        this.error("BotClient constructor: Error loading events:", err)
      })

    // Load all commands
    this.info("BotClient constructor: Loading commands...")
    loadCommands(this)
      .then(() => {
        this.debug("BotClient constructor: All commands loaded successfully.")
      })
      .catch((err) => {
        this.error("BotClient constructor: Error loading commands:", err)
      })
    this.info("BotClient constructor: Finished.")
  }

  /**
   * Logs an informational message.
   * @param {string} Text The message to log.
   * @param {...any} args Additional arguments to log.
   */
  info(Text, ...args) {
    this.logger.info(Text, ...args)
  }
  /**
   * Logs an error message.
   * @param {string} Text The message to log.
   * @param {...any} args Additional arguments to log.
   */
  error(Text, ...args) {
    this.logger.error(Text, ...args)
  }
  /**
   * Logs a warning message.
   * @param {string} Text The message to log.
   * @param {...any} args Additional arguments to log.
   */
  warn(Text, ...args) {
    this.logger.warn(Text, ...args)
  }
  /**
   * Logs a debug message.
   * @param {string} Text The message to log.
   * @param {...any} args Additional arguments to log.
   */
  debug(Text, ...args) {
    this.logger.debug(Text, ...args)
  }

  /**
   * Starts the bot, logging in to Discord.
   * Assumes Lavalink nodes are ready or will be handled by the manager.
   * @param {string} token - Discord bot token (default from .env)
   */
  async start(token = process.env.BOT_TOKEN) {
    this.info("BotClient start: Attempting to log in...")
    if (!token) {
      this.error("BotClient start: Bot token is missing. Ensure BOT_TOKEN is set in .env")
      throw new Error("Bot token is required.")
    }
    try {
      await this.login(token)
      this.info("BotClient start: Logged in successfully.")
    } catch (err) {
      this.error("BotClient start: Login failed:", err)
      throw err // Re-throw error after logging
    }
  }
}

export default BotClient
