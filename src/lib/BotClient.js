import { Client, GatewayIntentBits } from "discord.js"
import loadEvents from "../util/loadEvents.js"
import loadCommands from "../util/loadCommands.js"
import createLavalinkManager from "./LavalinkManager.js"
import ErrorMonitor from "./ErrorMonitor.js"

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

    // Initialize error monitoring
    this.errorMonitor = new ErrorMonitor(this.logger, {
      alertChannelId: process.env.ALERT_CHANNEL_ID,
      errorThreshold: parseInt(process.env.ERROR_THRESHOLD) || 10,
      errorCooldownMinutes: parseInt(process.env.ERROR_COOLDOWN_MINUTES) || 15
    })

    this.info("BotClient constructor: Logger and ErrorMonitor attached.")

    // Track startup time
    this.logger.time('bot_startup')

    // Build lavalink manager
    this.debug("BotClient constructor: Initializing Lavalink manager...")
    try {
      this.lavalink = createLavalinkManager(this)
      this.debug("BotClient constructor: Lavalink manager initialized.")
    } catch (error) {
      this.trackError(error, { component: 'lavalink_manager', phase: 'initialization' })
      throw error
    }

    // Load all event listeners
    this.info("BotClient constructor: Loading events...")
    loadEvents(this)
      .then(() => {
        this.debug("BotClient constructor: All events loaded successfully.")
      })
      .catch((err) => {
        this.error("BotClient constructor: Error loading events:", err)
        this.trackError(err, { component: 'events', phase: 'loading' })
      })

    // Load all commands
    this.info("BotClient constructor: Loading commands...")
    loadCommands(this)
      .then(() => {
        this.debug("BotClient constructor: All commands loaded successfully.")
      })
      .catch((err) => {
        this.error("BotClient constructor: Error loading commands:", err)
        this.trackError(err, { component: 'commands', phase: 'loading' })
      })
    
    this.info("BotClient constructor: Finished.")
  }

  // Shorthands for the logger
  info(Text, ...args) {
    this.logger.info(Text, ...args)
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

  // Enhanced error tracking method
  async trackError(error, context = {}) {
    return await this.errorMonitor.trackError(error, context, this)
  }

  // Method to get error statistics
  getErrorStats() {
    return this.errorMonitor.getStats()
  }

  // Method to get system metrics
  getSystemMetrics() {
    return {
      ...this.logger.getMetrics(),
      errors: this.getErrorStats(),
      guilds: this.guilds.cache.size,
      users: this.users.cache.size,
      channels: this.channels.cache.size,
      uptime: this.uptime,
      ping: this.ws.ping,
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      discordJsVersion: require('discord.js').version || 'unknown'
    }
  }

  /**
   * Starts the bot, logging in to Discord.
   * Assumes Lavalink nodes are ready or will be handled by the manager.
   * @param {string} token - Discord bot token (default from .env)
   */
  async start(token = process.env.BOT_TOKEN) {
    this.info("BotClient start: Attempting to log in...")
    
    if (!token) {
      const error = new Error("Bot token is required.")
      this.error("BotClient start: Bot token is missing. Ensure BOT_TOKEN is set in .env")
      await this.trackError(error, { component: 'auth', phase: 'token_validation' })
      throw error
    }
    
    try {
      await this.login(token)
      this.info("BotClient start: Logged in successfully.")
      
      // End startup timer
      const startupTime = this.logger.timeEnd('bot_startup')
      this.info(`BotClient start: Startup completed in ${startupTime?.toFixed(2)}ms`)
      
      // Log initial metrics
      this.logger.logStructured('info', 'Bot Started Successfully', {
        type: 'BOT_STARTUP',
        metrics: this.getSystemMetrics(),
        startupTime
      })
      
    } catch (err) {
      this.error("BotClient start: Login failed:", err)
      await this.trackError(err, { component: 'auth', phase: 'login' })
      throw err // Re-throw error after logging
    }
  }

  /**
   * Enhanced command execution with error tracking
   */
  async executeCommand(commandName, interaction) {
    const startTime = process.hrtime.bigint()
    this.logger.time(`command_${commandName}`)
    
    try {
      const command = this.commands.get(commandName)
      
      if (!command) {
        const error = new Error(`Command "${commandName}" not found`)
        await this.trackError(error, {
          commandName,
          userId: interaction.user.id,
          guildId: interaction.guildId,
          component: 'command_execution',
          phase: 'command_lookup'
        })
        throw error
      }

      this.info(`Executing command "${commandName}" for user ${interaction.user.tag}`, {
        commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId
      })

      await command.execute(interaction, this)
      
      // Log successful execution
      const executionTime = this.logger.timeEnd(`command_${commandName}`)
      this.logger.logStructured('info', 'Command Executed Successfully', {
        type: 'COMMAND_SUCCESS',
        commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        executionTime
      })

    } catch (error) {
      const executionTime = this.logger.timeEnd(`command_${commandName}`)
      
      // Track the error with enhanced context
      await this.trackError(error, {
        commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        component: 'command_execution',
        phase: 'execution',
        executionTime
      })
      
      throw error // Re-throw for upstream handling
    }
  }
}

export default BotClient
