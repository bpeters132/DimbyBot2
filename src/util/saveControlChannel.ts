import fs from "fs"
import path from "path"
import type { GuildSettingsStore } from "../types/index.js"
import type { LoggerInterface } from "../types/index.js"

const __dirname = import.meta.dirname

const storageDir = path.join(__dirname, "..", "..", "storage")
const settingsFile = path.join(storageDir, "guild_settings.json")

function getLogger(logger: Partial<LoggerInterface> | undefined): LoggerInterface {
  if (
    logger &&
    typeof logger.debug === "function" &&
    typeof logger.info === "function" &&
    typeof logger.warn === "function" &&
    typeof logger.error === "function" &&
    typeof logger.setDebugEnabled === "function" &&
    typeof logger.getDebugEnabled === "function" &&
    typeof logger.getLogFilePath === "function"
  ) {
    return logger as LoggerInterface
  }
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    setDebugEnabled: () => {},
    getDebugEnabled: () => false,
    getLogFilePath: () => null,
  }
}

/**
 * Ensures that the storage directory exists, creating it if necessary.
 */
export function ensureStorageDir(loggerInstance?: Partial<LoggerInterface>) {
  const logger = getLogger(loggerInstance)
  if (!fs.existsSync(storageDir)) {
    logger.debug(
      `[guildSettings] Storage directory ${storageDir} not found, attempting creation.`
    )
    try {
      fs.mkdirSync(storageDir, { recursive: true })
      logger.info(`[guildSettings] Created storage directory at: ${storageDir}`)
    } catch (error: unknown) {
      logger.error(`[guildSettings] Error creating storage directory: ${error}`)
    }
  }
}

/**
 * Reads and parses the guild settings from the JSON file.
 */
export function getGuildSettings(loggerInstance?: Partial<LoggerInterface>): GuildSettingsStore {
  const logger = getLogger(loggerInstance)
  ensureStorageDir(loggerInstance)
  logger.debug(`[guildSettings] Attempting to read settings from: ${settingsFile}`)
  try {
    if (fs.existsSync(settingsFile)) {
      const data = fs.readFileSync(settingsFile, "utf8")
      const parsed: unknown = JSON.parse(data)
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        logger.debug(`[guildSettings] Successfully read and parsed settings file.`)
        return parsed as GuildSettingsStore
      } else {
        logger.warn(`[guildSettings] Parsed settings file is not a valid object.`)
        return {}
      }
    } else {
      logger.debug(`[guildSettings] Settings file does not exist.`)
      return {}
    }
  } catch (error: unknown) {
    logger.error(
      `[guildSettings] Error reading or parsing guild settings from ${settingsFile}: ${error}`
    )
    return {}
  }
}

/**
 * Saves the provided guild settings object to the JSON file.
 */
export function saveGuildSettings(
  settings: GuildSettingsStore,
  loggerInstance?: Partial<LoggerInterface>
) {
  const logger = getLogger(loggerInstance)
  ensureStorageDir(loggerInstance)
  logger.debug(`[guildSettings] Attempting to save settings to: ${settingsFile}`)
  try {
    const data = JSON.stringify(settings, null, 4)
    fs.writeFileSync(settingsFile, data, "utf8")
    logger.debug(`[guildSettings] Successfully saved settings to: ${settingsFile}`)
  } catch (error: unknown) {
    logger.error(`[guildSettings] Error writing guild settings to ${settingsFile}: ${error}`)
  }
}
