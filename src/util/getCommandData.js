import fs from "fs"
import path from "path"
import { fileURLToPath, pathToFileURL } from "url"

// Get the current file's path and directory path using Node.js module functions.
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Dynamically loads command data from command files for deployment.
 * Reads the commands directory recursively, imports .js files,
 * and extracts the .data property (expected to be a SlashCommandBuilder output).
 * @returns {Promise<Array<object>>} A promise that resolves with an array of command data objects suitable for the Discord REST API.
 */
export default async function getCommandData() {
  const commandDataList = [] // Initialize an array to store the command data.
  // Define the base path for the commands directory, relative to this utility file.
  const commandsBasePath = path.join(__dirname, "../commands")
  console.log(`[DeployUtil] Starting command data loading from: ${commandsBasePath}`)

  // Define an asynchronous recursive function to load commands from a directory.
  const loadCommandsRecursive = async (directoryPath) => {
    try {
      // Read all entries (files and directories) in the current directory.
      const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
      console.log(`[DeployUtil] Scanning directory: ${directoryPath}`)

      // Iterate over each entry in the directory.
      for (const entry of entries) {
        const currentPath = path.join(directoryPath, entry.name)

        // If the entry is a directory, recurse into it.
        if (entry.isDirectory()) {
          await loadCommandsRecursive(currentPath)
        // If the entry is a JavaScript file.
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          // Convert the file path to a File URL for dynamic import.
          const fileUrl = pathToFileURL(currentPath)
          try {
            // Dynamically import the command module.
            const commandModule = await import(fileUrl)
            // Assume the main export is the default export.
            const command = commandModule.default

            // Validate if the imported module has the expected structure.
            if (command && typeof command === "object" && "data" in command) {
              // Further check if the 'data' object has a 'toJSON' method (like Discord.js builders).
              if (typeof command.data.toJSON === "function") {
                // Add the JSON representation of the command data to the list.
                commandDataList.push(command.data.toJSON())
                console.log(
                  `[DeployUtil] Found command data: ${command.data.name} from ${entry.name}`
                )
              } else {
                 // Warn if 'data' exists but lacks the 'toJSON' method.
                 console.warn(
                   `[DeployUtil][WARNING] Command at ${currentPath} has a 'data' property, but it does not have a toJSON method.`
                 )
              }
            } else {
              // Warn if the file is missing a default export or the 'data' property.
              console.warn(
                `[DeployUtil][WARNING] Command file at ${currentPath} is missing a default export or a 'data' property.`
              )
            }
          } catch (error) {
            // Log errors encountered during file import or processing.
            console.error(`[DeployUtil] Error loading command file ${currentPath}:`, error)
          }
        }
      }
    } catch (error) {
      // Log errors encountered while reading a directory.
      console.error(`[DeployUtil] Error reading directory ${directoryPath}:`, error)
    }
  }

  // Start the recursive loading process from the base commands path.
  try {
     await loadCommandsRecursive(commandsBasePath)
     console.log(
       `[DeployUtil] Finished loading command data. Total found: ${commandDataList.length}`
     )
     // Return the list of collected command data.
     return commandDataList
  } catch (error) {
      // Log errors if the initial loading fails.
      console.error(`[DeployUtil] Failed to initiate command data loading from ${commandsBasePath}:`, error)
      // Return an empty array in case of failure to prevent further issues.
      return []
  }
} 