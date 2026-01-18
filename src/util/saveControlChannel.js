import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const storageDir = path.join(__dirname, "..", "..", "storage")
const settingsFile = path.join(storageDir, "guild_settings.json")

function getLogger(logger) {
  if (
    logger &&
    typeof logger.debug === "function" &&
    typeof logger.info === "function" &&
    typeof logger.warn === "function" &&
    typeof logger.error === "function"
  ) {
    return logger
  }
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

/**
 * Ensures that the storage directory exists, creating it if necessary.
 * This function is synchronous and will block until the directory is created.
 */
export function ensureStorageDir(loggerInstance) {
  const logger = getLogger(loggerInstance)
  if (!fs.existsSync(storageDir)) {
    logger.debug(
      `[guildSettings] Storage directory ${storageDir} not found, attempting creation.`
    )
    try {
      fs.mkdirSync(storageDir, { recursive: true })
      logger.info(`[guildSettings] Created storage directory at: ${storageDir}`)
    } catch (error) {
      logger.error(`[guildSettings] Error creating storage directory: ${error}`)
    }
  }
}

/**
 * Reads and parses the guild settings from the JSON file.
 * @returns {object} The parsed guild settings object, or an empty object if the file doesn't exist or an error occurs.
 */
export function getGuildSettings(loggerInstance) {
  const logger = getLogger(loggerInstance)
  ensureStorageDir(loggerInstance)
  logger.debug(`[guildSettings] Attempting to read settings from: ${settingsFile}`)
  try {
    if (fs.existsSync(settingsFile)) {
      const data = fs.readFileSync(settingsFile, "utf8")
      const parsed = JSON.parse(data)
      if (typeof parsed === "object" && parsed !== null) {
        logger.debug(`[guildSettings] Successfully read and parsed settings file.`)
        return parsed
      } else {
        logger.warn(`[guildSettings] Parsed settings file is not a valid object.`)
        return {}
      }
    } else {
      logger.debug(`[guildSettings] Settings file does not exist.`)
      return {}
    }
  } catch (error) {
    logger.error(
      `[guildSettings] Error reading or parsing guild settings from ${settingsFile}: ${error}`
    )
    return {}
  }
}

/**
 * Saves the provided guild settings object to the JSON file.
 * @param {object} settings The guild settings object to save.
 */
export function saveGuildSettings(settings, loggerInstance) {
  const logger = getLogger(loggerInstance)
  ensureStorageDir(loggerInstance)
  logger.debug(`[guildSettings] Attempting to save settings to: ${settingsFile}`)
  try {
    const data = JSON.stringify(settings, null, 4)
    fs.writeFileSync(settingsFile, data, "utf8")
    logger.debug(
      `[guildSettings] Successfully saved settings. Data snippet: ${data.substring(0, 100)}...`
    )
  } catch (error) {
    logger.error(`[guildSettings] Error writing guild settings to ${settingsFile}: ${error}`)
  }
}
