import { Routes } from "discord.js"
import { REST } from "@discordjs/rest"
import getCommandData from "../util/getCommandData.js"
import dotenv from "dotenv"
dotenv.config()

;(async () => {
  const appID = process.env.CLIENT_ID
  const devGuildID = process.env.GUID_ID
  const token = process.env.TOKEN

  if (!devGuildID) {
    console.error(
      "GUID_ID is not set in the environment variables. Cannot deploy guild commands.",
    )
    return
  }

  const rest = new REST({ version: "10" }).setToken(token)

  console.log("Gathering command data...")
  const commandsToDeploy = await getCommandData()

  if (!commandsToDeploy || commandsToDeploy.length === 0) {
    console.error("No command data found to deploy. Exiting.")
    return
  }

  console.log(
    `Started refreshing ${commandsToDeploy.length} application (/) commands for guild ${devGuildID}.`,
  )

  try {
    const data = await rest.put(
      Routes.applicationGuildCommands(appID, devGuildID),
      {
        body: commandsToDeploy,
      },
    )

    console.log(
      `Successfully reloaded ${data.length} application (/) commands for guild ${devGuildID}.`,
    )
  } catch (error) {
    console.error(`Failed to register application commands for guild ${devGuildID}:`, error)
  }
})()
