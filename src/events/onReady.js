import { ActivityType } from "discord.js"

/**
 * @param {import('../lib/BotClient').default} client
 */
export default async (client) => {
  client.on("ready", () => {
    client.debug("Ready event triggered.") // Debug log
    client.lavalink.init(client.user) // init lavalink

    client.info(`Logged in as ${client.user.tag}! (${client.user.id})`)
    
    // Initial status
    client.user.setActivity("I have been reborn", { type: ActivityType.Custom })
    
    // Create a toggle for status rotation
    let showGuildCount = true
    
    setInterval(async () => {
      client.debug("Status update interval triggered.") // Debug log
      if (showGuildCount) {
        const guildCount = client.guilds.cache.size
        client.debug(`Setting status to watch ${guildCount} servers.`) // Debug log
        client.user.setActivity(`${guildCount} servers`, { type: ActivityType.Watching })
        client.info(`Set status to ${guildCount} servers`)
      } else {
        client.debug("Setting status to 'I have been reborn'.") // Debug log
        client.user.setActivity("I have been reborn", { type: ActivityType.Custom })
        client.info("Set status to I have been reborn")
      }
      showGuildCount = !showGuildCount
      client.debug(`showGuildCount toggled to: ${showGuildCount}`) // Debug log
    }, 10 * 60 * 1000) // Change status every 10 minutes
  })
}
