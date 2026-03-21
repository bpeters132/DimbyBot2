import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import { Collection } from "discord.js"
import type BotClient from "../lib/BotClient.js"
import type { Command } from "../types/index.js"

const __dirname = import.meta.dirname

/**
 * Dynamically and recursively loads command files from a specified directory and its subdirectories.
 */
export default async (client: BotClient) => {
  client.commands = new Collection<string, Command>()

  const commandsBasePath = path.join(__dirname, "../commands")
  client.info(`Starting command loading from base path: ${commandsBasePath}`)

  const loadCommandsRecursive = async (directoryPath: string) => {
    try {
      const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
      client.info(`Scanning directory: ${directoryPath}`)

      for (const entry of entries) {
        const currentPath = path.join(directoryPath, entry.name)

        if (entry.isDirectory()) {
          await loadCommandsRecursive(currentPath)
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          const fileUrl = pathToFileURL(currentPath)
          try {
            const commandModule = (await import(fileUrl.href)) as { default?: Command }
            const command = commandModule.default

            if (command && typeof command === "object" && "data" in command && "execute" in command) {
              if (client.commands.has(command.data.name)) {
                client.warn(
                  `[WARNING] Duplicate command name "${command.data.name}" found at ${currentPath}. Skipping.`
                )
              } else {
                client.commands.set(command.data.name, command)
                const moduleId = entry.name.replace(/\.js$/i, "")
                client.info(`Loaded command: ${command.data.name} (module: ${moduleId})`)
              }
            } else {
              client.warn(
                `[WARNING] The command at ${currentPath} is missing a required "data" or "execute" property.`
              )
            }
          } catch (error: unknown) {
            client.error(`Error loading command ${currentPath}:`, error)
          }
        }
      }
    } catch (error: unknown) {
      client.error(`Error reading directory ${directoryPath}:`, error)
    }
  }

  try {
    await loadCommandsRecursive(commandsBasePath)
    client.info(`Finished loading commands. Total loaded: ${client.commands.size}`)
  } catch (error: unknown) {
    client.error(`Failed to initiate command loading from ${commandsBasePath}:`, error)
  }
}
