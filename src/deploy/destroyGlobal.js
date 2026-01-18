import { Routes } from "discord.js"
import { REST } from "@discordjs/rest"
import dotenv from "dotenv"
dotenv.config()

/**
 * Deletes all global application commands.
 * @returns {Promise<void>}
 */
async function destroyGlobalCommands() {
  const appID = process.env.CLIENT_ID
  const token = process.env.BOT_TOKEN
  const rest = new REST({ version: "10" }).setToken(token)

  try {
    await rest.put(Routes.applicationCommands(appID), { body: [] })
    console.log("Successfully deleted all global commands.")
  } catch (error) {
    console.error(error)
  }
}

destroyGlobalCommands()
