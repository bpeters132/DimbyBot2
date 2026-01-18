import { Routes } from "discord.js"
import { REST } from "@discordjs/rest"
import getCommandData from "../util/getCommandData.js"
import dotenv from "dotenv"
dotenv.config()

/**
 * Deploys application commands globally using environment configuration.
 * @returns {Promise<void>}
 */
async function deployGlobalCommands() {
  const appID = process.env.CLIENT_ID
  const token = process.env.BOT_TOKEN

  const missing = []
  if (!appID) missing.push("CLIENT_ID")
  if (!token) missing.push("BOT_TOKEN")
  if (missing.length > 0) {
    console.error(`Missing required environment variable(s): ${missing.join(", ")}`)
    process.exit(1)
  }

  const rest = new REST({ version: "10" }).setToken(token)

  console.log("Gathering command data...")
  const commandsToDeploy = await getCommandData()

  if (!commandsToDeploy || commandsToDeploy.length === 0) {
    console.error("No command data found to deploy. Exiting.")
    process.exitCode = 1
    return
  }

  console.log(
    `Started refreshing ${commandsToDeploy.length} application (/) commands globally.`,
  )

  try {
    const data = await rest.put(Routes.applicationCommands(appID), {
      body: commandsToDeploy,
    })

    console.log(
      `Successfully reloaded ${data.length} application (/) commands globally.`,
    )
  } catch (error) {
    console.error("Failed to register global application commands:", error)
  }
}

deployGlobalCommands().catch((error) => {
  console.error("Failed to deploy global application commands:", error)
  process.exitCode = 1
})
