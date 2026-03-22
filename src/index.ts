/**
 * Bot application entry point.
 */
import "dotenv/config"
import path from "path"
import BotClient from "./lib/BotClient.js"
import Logger from "./lib/Logger.js"
import fs from "fs"

const logFilePath = path.join(import.meta.dirname, "..", "logs", "app.log")

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
if (logger.getDebugEnabled()) {
    logger.info("Debug logging is enabled via LOG_LEVEL environment variable.")
} else {
    logger.info("Debug logging is disabled. Set LOG_LEVEL=debug to enable it.")
}

;(async () => {
  try {
    logger.debug("Initializing BotClient...")
    const client = new BotClient(logger)
    logger.debug("BotClient initialized.")

    logger.debug("Starting BotClient...")
    await client.start()
    logger.info("BotClient started successfully.")
  } catch (error) {
    logger.error("Fatal error during application startup:", error)
    process.exit(1)
  }
})()
