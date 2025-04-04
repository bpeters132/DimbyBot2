import fs from "fs"
import path from "path"
import { fileURLToPath, pathToFileURL } from "url"
import { Collection } from "discord.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Dynamically and recursively loads command files from a specified directory and its subdirectories.
 * @param {import('../lib/BotClient.js').default} client The bot client instance.
 */
export default async (client) => {
  client.commands = new Collection()

  const commandsBasePath = path.join(__dirname, "../commands")
  client.log(`Starting command loading from base path: ${commandsBasePath}`)

  // Recursive function to load commands
  const loadCommandsRecursive = async (directoryPath) => {
    try {
      const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
      client.log(`Scanning directory: ${directoryPath}`)

      for (const entry of entries) {
        const currentPath = path.join(directoryPath, entry.name)

        if (entry.isDirectory()) {
          // Recurse into subdirectory
          await loadCommandsRecursive(currentPath)
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          // Process .js file
          const fileUrl = pathToFileURL(currentPath)
          try {
            const commandModule = await import(fileUrl)
            const command = commandModule.default // Assuming default export

            if (
              command &&
              typeof command === "object" &&
              "data" in command &&
              "execute" in command
            ) {
              if (client.commands.has(command.data.name)) {
                client.warn(
                  `[WARNING] Duplicate command name "${command.data.name}" found at ${currentPath}. Skipping.`
                )
              } else {
                client.commands.set(command.data.name, command)
                client.log(`Loaded command: ${command.data.name} from ${entry.name}`)
              }
            } else {
              client.warn(
                `[WARNING] The command at ${currentPath} is missing a required "data" or "execute" property.`
              )
            }
          } catch (error) {
            client.error(`Error loading command ${currentPath}:`, error)
          }
        }
      }
    } catch (error) {
      // Log error if a specific directory can't be read, but continue loading others
      client.error(`Error reading directory ${directoryPath}:`, error)
    }
  }

  // Start the recursive loading process
  try {
    await loadCommandsRecursive(commandsBasePath)
    client.log(`Finished loading commands. Total loaded: ${client.commands.size}`)
  } catch (error) {
    // Catch any top-level error during the initial call (e.g., base directory doesn't exist)
    client.error(`Failed to initiate command loading from ${commandsBasePath}:`, error)
  }
}
