import fs from "fs"
import path from "path"
import { fileURLToPath, pathToFileURL } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Dynamically loads command data from command files for deployment.
 * Reads the commands directory recursively, imports .js files,
 * and extracts the .data property (expected to be a SlashCommandBuilder output).
 * @returns {Promise<Array<object>>} A promise that resolves with an array of command data objects suitable for the Discord REST API.
 */
export default async function getCommandData() {
  const commandDataList = []
  const commandsBasePath = path.join(__dirname, "../commands") // Assumes this file is in src/util
  console.log(`[DeployUtil] Starting command data loading from: ${commandsBasePath}`)

  const loadCommandsRecursive = async (directoryPath) => {
    try {
      const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
      console.log(`[DeployUtil] Scanning directory: ${directoryPath}`)

      for (const entry of entries) {
        const currentPath = path.join(directoryPath, entry.name)

        if (entry.isDirectory()) {
          await loadCommandsRecursive(currentPath)
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          const fileUrl = pathToFileURL(currentPath)
          try {
            const commandModule = await import(fileUrl)
            const command = commandModule.default

            if (command && typeof command === "object" && "data" in command) {
              // Check if data has a toJSON method (like SlashCommandBuilder output)
              if (typeof command.data.toJSON === "function") {
                commandDataList.push(command.data.toJSON())
                console.log(
                  `[DeployUtil] Found command data: ${command.data.name} from ${entry.name}`
                )
              } else {
                 console.warn(
                   `[DeployUtil][WARNING] Command at ${currentPath} has a 'data' property, but it does not have a toJSON method.`
                 )
              }
            } else {
              console.warn(
                `[DeployUtil][WARNING] Command file at ${currentPath} is missing a default export or a 'data' property.`
              )
            }
          } catch (error) {
            console.error(`[DeployUtil] Error loading command file ${currentPath}:`, error)
          }
        }
      }
    } catch (error) {
      console.error(`[DeployUtil] Error reading directory ${directoryPath}:`, error)
    }
  }

  // Start the recursive loading
  try {
     await loadCommandsRecursive(commandsBasePath)
     console.log(
       `[DeployUtil] Finished loading command data. Total found: ${commandDataList.length}`
     )
     return commandDataList
  } catch (error) {
      console.error(`[DeployUtil] Failed to initiate command data loading from ${commandsBasePath}:`, error)
      return [] // Return empty array on failure
  }
} 