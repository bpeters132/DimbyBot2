import { Routes } from "discord.js"
import { REST } from "@discordjs/rest"
import getCommandData from "../util/getCommandData.js"
import dotenv from "dotenv"
dotenv.config()

;(async () => {
  const appID = process.env.APP_ID
  const token = process.env.TOKEN

  const rest = new REST({ version: "10" }).setToken(token)

  console.log("Gathering command data...")
  const commandsToDeploy = await getCommandData()

  if (!commandsToDeploy || commandsToDeploy.length === 0) {
    console.error("No command data found to deploy. Exiting.")
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
})()
