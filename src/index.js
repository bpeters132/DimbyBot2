import "dotenv/config"
import path from "path"
import { fileURLToPath } from "url"
import BotClient from "./lib/BotClient.js"
import Logger from "./lib/Logger.js"
import AdminServer from "./web/AdminServer.js"
import fs from "fs"

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Construct the path to the log file
const logFilePath = path.join(__dirname, "..", "logs", "app.log") // Ensure logs directory and filename

// Create logs directory if it doesn't exist
try {
    const logDirectory = path.dirname(logFilePath)
    if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory, { recursive: true })
        console.log(`Log directory created at ${logDirectory}`)
    }
} catch (error) {
    console.error("Failed to create log directory:", error)
    // Optionally handle this error, e.g., by exiting or disabling file logging
}

// Initialize the logger, passing the log file path
const logger = new Logger(logFilePath)

logger.info("Starting application...")
// Add a check to inform about debug status based on environment variable
if (process.env.LOG_LEVEL?.toLowerCase() === 'debug') {
    logger.info("Debug logging is enabled via LOG_LEVEL environment variable.")
} else {
    logger.info("Debug logging is disabled. Set LOG_LEVEL=debug to enable it.")
}

async function startApplication() {
  try {
    logger.debug("Initializing BotClient...")
    // Pass the logger instance to the client constructor
    const client = new BotClient(logger)
    logger.debug("BotClient initialized.")

    logger.debug("Starting BotClient...")
    await client.start() // Assuming start() handles login and further setup
    logger.info("BotClient started successfully.")

    // Start admin web server if enabled
    if (process.env.ENABLE_ADMIN_SERVER === 'true') {
      logger.info("Starting Admin Web Server...")
      try {
        const adminServer = new AdminServer(client, logger, {
          port: process.env.ADMIN_PORT || 3000,
          sessionSecret: process.env.SESSION_SECRET,
          discordClientId: process.env.DISCORD_CLIENT_ID,
          discordClientSecret: process.env.DISCORD_CLIENT_SECRET,
          adminUserIds: process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [],
          enableAuth: process.env.ADMIN_DISABLE_AUTH !== 'true'
        })
        
        await adminServer.start()
        logger.info(`Admin Web Server started successfully on port ${process.env.ADMIN_PORT || 3000}`)
        
        // Graceful shutdown handling
        process.on('SIGINT', async () => {
          logger.info('Received SIGINT, shutting down gracefully...')
          await adminServer.stop()
          process.exit(0)
        })
        
        process.on('SIGTERM', async () => {
          logger.info('Received SIGTERM, shutting down gracefully...')
          await adminServer.stop()
          process.exit(0)
        })
        
      } catch (error) {
        logger.error("Failed to start Admin Web Server:", error)
        // Continue without admin server if it fails
      }
    } else {
      logger.info("Admin Web Server is disabled (set ENABLE_ADMIN_SERVER=true to enable)")
    }

  } catch (error) {
    logger.error("Fatal error during application startup:", error)
    process.exit(1) // Exit if core initialization fails
  }
}

// Start the application
startApplication()
