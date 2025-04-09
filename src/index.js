import "dotenv/config"
import path from "path"
import { fileURLToPath } from "url"
import BotClient from "./lib/BotClient.js"
import Logger from "./lib/Logger.js"
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

try {
  logger.debug("Initializing BotClient...")
  // Pass the logger instance to the client constructor
  const client = new BotClient(logger)
  logger.debug("BotClient initialized.")

  logger.debug("Starting BotClient...")
  client.start() // Assuming start() handles login and further setup
  logger.info("BotClient started successfully.")

} catch (error) {
  logger.error("Fatal error during application startup:", error)
  process.exit(1) // Exit if core initialization fails
}
