import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const storageDir = path.join(__dirname, "..", "..", "storage")
const settingsFile = path.join(storageDir, "guild_settings.json")

// Pass client for logging - Exported for use in handler
export function ensureStorageDir() {
  if (!fs.existsSync(storageDir)) {
    console.debug(`[guildSettings] Storage directory ${storageDir} not found, attempting creation.`)
    try {
      fs.mkdirSync(storageDir, { recursive: true })
      console.log(`[guildSettings] Created storage directory at: ${storageDir}`)
    } catch (error) {
      console.error(`[guildSettings] Error creating storage directory: ${error}`)
    }
  }
}

// Pass client for logging and calling ensureStorageDir
export function getGuildSettings() {
  ensureStorageDir() // Pass client
  console.debug(`[guildSettings] Attempting to read settings from: ${settingsFile}`)
  try {
    if (fs.existsSync(settingsFile)) {
      const data = fs.readFileSync(settingsFile, "utf8")
      const parsed = JSON.parse(data)
      if (typeof parsed === "object" && parsed !== null) {
        console.debug(`[guildSettings] Successfully read and parsed settings file.`)
        return parsed
      } else {
        console.warn(`[guildSettings] Parsed settings file is not a valid object.`)
        return {}
      }
    } else {
      console.debug(`[guildSettings] Settings file does not exist.`)
      return {}
    }
  } catch (error) {
    console.error(
      `[guildSettings] Error reading or parsing guild settings from ${settingsFile}: ${error}`
    )
    return {}
  }
}

// Pass client for logging and calling ensureStorageDir
export function saveGuildSettings(settings) {
  ensureStorageDir() // Pass client
  console.debug(`[guildSettings] Attempting to save settings to: ${settingsFile}`)
  try {
    const data = JSON.stringify(settings, null, 4)
    fs.writeFileSync(settingsFile, data, "utf8")
    console.debug(
      `[guildSettings] Successfully saved settings. Data snippet: ${data.substring(0, 100)}...`
    )
  } catch (error) {
    console.error(`[guildSettings] Error writing guild settings to ${settingsFile}: ${error}`)
  }
}
