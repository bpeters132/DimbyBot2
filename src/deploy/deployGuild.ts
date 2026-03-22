import { Routes } from "discord.js"
import { REST } from "@discordjs/rest"
import getCommandData from "../util/getCommandData.js"
import dotenv from "dotenv"
dotenv.config()

/**
 * Deploys application commands to a single guild using environment configuration.
 * @returns {Promise<void>}
 */
async function deployGuildCommands() {
  const appID = process.env.CLIENT_ID
  const devGuildID = process.env.GUILD_ID
  const token = process.env.BOT_TOKEN

  if (!devGuildID) {
    console.error(
      "GUILD_ID is not set in the environment variables. Cannot deploy guild commands.",
    )
    process.exit(1)
  }
  if (!appID || !token) {
    console.error("CLIENT_ID and BOT_TOKEN are required to deploy guild commands.")
    process.exit(1)
  }

  const rest = new REST({ version: "10" }).setToken(token)

  console.log("Gathering command data...")
  const commandsToDeploy = await getCommandData()

  if (!commandsToDeploy || commandsToDeploy.length === 0) {
    console.error("No command data found to deploy. Exiting.")
    process.exit(1)
  }

  console.log(
    `Started refreshing ${commandsToDeploy.length} application (/) commands for guild ${devGuildID}.`,
  )

  try {
    const data = (await rest.put(Routes.applicationGuildCommands(appID, devGuildID), {
      body: commandsToDeploy,
    })) as unknown[]

    console.log(
      `Successfully reloaded ${data.length} application (/) commands for guild ${devGuildID}.`,
    )
  } catch (error) {
    console.error(`Failed to register application commands for guild ${devGuildID}:`, error)
    process.exit(1)
  }
}

deployGuildCommands().catch((err: unknown) => {
  console.error("deployGuildCommands failed:", err)
  process.exit(1)
})
