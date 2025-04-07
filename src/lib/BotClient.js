import { Client, GatewayIntentBits } from "discord.js"
import { fileURLToPath } from "url"
import path from "path"
import loadEvents from "../util/loadEvents.js"
import loadCommands from "../util/loadCommands.js"
import Logger from "./Logger.js"
import createLavalinkManager from "./LavalinkManager.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class BotClient extends Client {
  constructor() {
    super({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    })

    // Create and attach a custom logger instance to the bot
    this.logger = new Logger(path.join(__dirname, "../..", "logs.log"))

    // Build lavalink manager
    this.lavalink = createLavalinkManager(this)

    // Load all event listeners
    loadEvents(this)
      .then(() => {
        this.warn("Loaded all events")
      })
      .catch((err) => {
        this.error("Error loading events:", err)
      })

    // Load all commands
    loadCommands(this)
      .then(() => {
        this.warn("Loaded all commands")
      })
      .catch((err) => {
        this.error("Error loading commands:", err)
      })
  }

  /**
   * Starts the bot, loading events and logging in to Discord
   * @param {string} token - Discord bot token (default from .env)
   */
  async start(token = process.env.BOT_TOKEN) {
    try {
      // Log into Discord
      await this.login(token)
    } catch (err) {
      this.error(err)
    }
  }

  // Shorthands for the logger
  log(Text, ...args) {
    this.logger.log(Text, ...args)
  }
  error(Text, ...args) {
    this.logger.error(Text, ...args)
  }
  warn(Text, ...args) {
    this.logger.warn(Text, ...args)
  }
  debug(Text, ...args) {
    this.logger.debug(Text, ...args)
  }
}

export default BotClient
