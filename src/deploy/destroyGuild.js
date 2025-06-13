import { Routes } from "discord.js"
import { REST } from "@discordjs/rest"
import dotenv from "dotenv"
dotenv.config()

const appID = process.env.CLIENT_ID
const devServerID = process.env.GUILD_ID
const token = process.env.BOT_TOKEN
const rest = new REST({ version: "10" }).setToken(token)

// for guild-based commands
rest
  .put(Routes.applicationGuildCommands(appID, devServerID), { body: [] })
  .then(() => console.log("Successfully deleted all dev commands."))
  .catch(console.error)
