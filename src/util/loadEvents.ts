import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import type BotClient from "../lib/BotClient.js"
import type { EventSetup } from "../types/index.js"

const __dirname = import.meta.dirname

/**
 * Dynamically loads and executes event handler modules from the events directory.
 */
export default async (client: BotClient) => {
  const eventsPath = path.join(__dirname, "../events")

  client.info(`Loading events from: ${eventsPath}`)

  try {
    const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"))

    client.info(`Found ${eventFiles.length} event files.`)

    let loadedCount = 0
    for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file)
      const fileUrl = pathToFileURL(filePath)

      try {
        const eventModule = (await import(fileUrl.href)) as { default?: EventSetup }
        const setupEvent = eventModule.default

        if (typeof setupEvent === "function") {
          void setupEvent(client)
          const moduleId = file.replace(/\.js$/i, "")
          client.info(`Loaded event handler: ${moduleId}`)
          loadedCount++
        } else {
          client.warn(
            `[WARNING] The event file at ${filePath} does not have a default export that is a function.`
          )
        }
      } catch (error: unknown) {
        client.error(`Error loading event handler ${filePath}:`, error)
      }
    }
    client.info(`Successfully loaded ${loadedCount} event handlers.`)
  } catch (error: unknown) {
    client.error(`Error reading events directory ${eventsPath}:`, error)
  }
}
