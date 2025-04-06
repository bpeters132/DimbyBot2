import fs from "fs"
import path from "path"
import { fileURLToPath, pathToFileURL } from "url"

// Helper to get __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Dynamically loads and executes event handler modules from the events directory.
 * @param {import('../lib/BotClient.js').default} client The bot client instance.
 */
export default async (client) => {
  const eventsPath = path.join(__dirname, "../events")

  client.log(`Loading events from: ${eventsPath}`)

  try {
    const eventFiles = fs
      .readdirSync(eventsPath)
      .filter((file) => file.endsWith(".js"))

    client.log(`Found ${eventFiles.length} event files.`) 

    let loadedCount = 0
    for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file)
      const fileUrl = pathToFileURL(filePath)

      try {
        const eventModule = await import(fileUrl)
        const setupEvent = eventModule.default // Expecting a default export function

        if (typeof setupEvent === "function") {
          setupEvent(client) // Execute the function to attach the listener(s)
          client.log(`Loaded event handler: ${file}`)
          loadedCount++
        } else {
          client.warn(
            `[WARNING] The event file at ${filePath} does not have a default export that is a function.`,
          )
        }
      } catch (error) {
        client.error(`Error loading event handler ${filePath}:`, error)
      }
    }
    client.log(`Successfully loaded ${loadedCount} event handlers.`)
  } catch (error) {
    client.error(`Error reading events directory ${eventsPath}:`, error)
  }
}
