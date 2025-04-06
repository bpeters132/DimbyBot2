import { Client, GatewayIntentBits } from "discord.js"
import loadEvents from "../util/loadEvents.js"
import loadCommands from "../util/loadCommands.js"
import Logger from "./Logger.js"
import dotenv from "dotenv"
import { fileURLToPath } from "url"
import path from "path"
import createLavalinkManager from "./LavalinkManager.js"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Custom BotClient class that extends the base Discord Client
class BotClient extends Client {
  constructor() {
    // Initialize the Discord Client with required gateway intents
    super({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    })

    // Create and attach a custom logger instance to the bot
    this.logger = new Logger(path.join(__dirname, "../..", "logs.log"))

    // Build lavalink manager
    this.lavalink = createLavalinkManager(this)

    // Load all event listeners
    loadEvents(this)

    // Load all commands
    loadCommands(this)
      .then(() => {
        this.log("Loaded all commands")
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
}

export default BotClient
