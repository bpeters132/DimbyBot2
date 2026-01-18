import { ActivityType } from "discord.js"

/**
 * @param {import('../lib/BotClient').default} client
 */
export default async (client) => {
  client.on("clientReady", () => {
    client.debug("Ready event triggered.") // Debug log
    client.lavalink.init(client.user) // init lavalink

    client.info(`Logged in as ${client.user.tag}! (${client.user.id})`)
    
    // Initial status
    client.user.setActivity("I hate that Pancake guy!", { type: ActivityType.Custom })
    
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
        client.debug("Setting status to 'I hate that Pancake guy!'.") // Debug log
        client.user.setActivity("I hate that Pancake guy!", { type: ActivityType.Custom })
        client.info("I hate that Pancake guy!")
      }
      showGuildCount = !showGuildCount
      client.debug(`showGuildCount toggled to: ${showGuildCount}`) // Debug log
    }, 10 * 60 * 1000) // Change status every 10 minutes
  })
}
