import { Routes } from "discord.js"
import { REST } from "@discordjs/rest"
import dotenv from "dotenv"
dotenv.config()

/**
 * Deletes all guild-specific application commands for the configured guild.
 * @returns {Promise<void>}
 */
async function destroyGuildCommands() {
  const appID = process.env.CLIENT_ID
  const devServerID = process.env.GUILD_ID
  const token = process.env.BOT_TOKEN
  const rest = new REST({ version: "10" }).setToken(token)

  try {
    await rest.put(Routes.applicationGuildCommands(appID, devServerID), { body: [] })
    console.log("Successfully deleted all dev commands.")
  } catch (error) {
    console.error(error)
  }
}

destroyGuildCommands()
