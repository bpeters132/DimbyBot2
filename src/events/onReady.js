import { ActivityType } from "discord.js"

/**
 * @param {import('../lib/BotClient').default} client
 */
export default async (client) => {
  client.on("ready", () => {
    client.lavalink.init(client.user) // init lavalink

    client.log(`Logged in as ${client.user.tag}! (${client.user.id})`)
    
    // Initial status
    client.user.setActivity("I have been reborn 🙏", { type: ActivityType.Custom })
    
    // Create a toggle for status rotation
    let showGuildCount = true
    
    setInterval(async () => {
      if (showGuildCount) {
        const guildCount = client.guilds.cache.size
        client.user.setActivity(`${guildCount} servers`, { type: ActivityType.Watching })
        client.log(`Set status to ${guildCount} servers`)
      } else {
        client.user.setActivity("I have been reborn 🙏", { type: ActivityType.Custom })
        client.log(`Set status to I have been reborn 🙏`)
      }
      showGuildCount = !showGuildCount
    }, 10 * 60 * 1000) // Change status every 10 minutes
  })
}
