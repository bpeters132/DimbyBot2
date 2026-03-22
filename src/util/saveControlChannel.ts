import fs from "fs"
import path from "path"
import type { GuildSettingsStore } from "../types/index.js"
import type { LoggerInterface } from "../types/index.js"

const __dirname = import.meta.dirname

const storageDir = path.join(__dirname, "..", "..", "storage")
const settingsFile = path.join(storageDir, "guild_settings.json")

/** In-memory store; synced from disk once at cold start. Updated only after a successful save. */
let guildSettingsCache: GuildSettingsStore | null = null

function getLogger(logger: Partial<LoggerInterface> | undefined): LoggerInterface {
  if (
    logger &&
    typeof logger.debug === "function" &&
    typeof logger.info === "function" &&
    typeof logger.warn === "function" &&
    typeof logger.error === "function"
  ) {
    const l = logger as Partial<LoggerInterface>
    return {
      debug: (text: string, ...args: unknown[]) => l.debug!(text, ...args),
      info: (text: string, ...args: unknown[]) => l.info!(text, ...args),
      warn: (text: string, ...args: unknown[]) => l.warn!(text, ...args),
      error: (text: string, ...args: unknown[]) => l.error!(text, ...args),
      setDebugEnabled:
        typeof l.setDebugEnabled === "function" ? l.setDebugEnabled.bind(l) : () => {},
      getDebugEnabled:
        typeof l.getDebugEnabled === "function" ? l.getDebugEnabled.bind(l) : () => false,
      getLogFilePath:
        typeof l.getLogFilePath === "function" ? l.getLogFilePath.bind(l) : () => null,
    }
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

function readGuildSettingsFromDisk(loggerInstance?: Partial<LoggerInterface>): GuildSettingsStore {
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
      }
      logger.warn(`[guildSettings] Parsed settings file is not a valid object.`)
      return {}
    }
    logger.debug(`[guildSettings] Settings file does not exist.`)
    return {}
  } catch (error: unknown) {
    logger.error(
      `[guildSettings] Error reading or parsing guild settings from ${settingsFile}: ${error}`
    )
    return {}
  }
}

/**
 * Returns the mutable guild settings map, loading from disk on first use in this process.
 * After a successful {@link saveGuildSettings}, the cache is replaced by the object that was saved.
 */
export function getGuildSettings(loggerInstance?: Partial<LoggerInterface>): GuildSettingsStore {
  if (guildSettingsCache === null) {
    guildSettingsCache = readGuildSettingsFromDisk(loggerInstance)
  }
  return guildSettingsCache
}

/**
 * Persists guild settings to disk. On success, replaces the in-memory cache with `settings`.
 * @returns whether the file was written successfully
 */
export function saveGuildSettings(
  settings: GuildSettingsStore,
  loggerInstance?: Partial<LoggerInterface>
): boolean {
  const logger = getLogger(loggerInstance)
  ensureStorageDir(loggerInstance)
  logger.debug(`[guildSettings] Attempting to save settings to: ${settingsFile}`)
  try {
    const data = JSON.stringify(settings, null, 4)
    fs.writeFileSync(settingsFile, data, "utf8")
    guildSettingsCache = settings
    logger.debug(`[guildSettings] Successfully saved settings to: ${settingsFile}`)
    return true
  } catch (error: unknown) {
    logger.error(`[guildSettings] Error writing guild settings to ${settingsFile}: ${error}`)
    return false
  }
}
