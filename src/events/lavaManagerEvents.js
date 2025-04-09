/**
 * @param {import('../lib/BotClient.js').default} client
 */
export default async (client) => {
  // TODO: DEFINE EVENTS
  client.lavalink
    .on("playerCreate", (player) => {
      client.info(`Player created: ${player.guildId}`)
    })
    .on("trackStart", (player, track) => {
      client.info("Track started")
      const channel = client.channels.cache.get(player.textChannelId)
      if (channel) channel.send(`Now playing: ${track.info.title}`)
    })
    .on("queueEnd", (player) => {
      client.info("Queue Ended")
      const channel = client.channels.cache.get(player.textChannelId)
      if (channel) channel.send("Queue has ended!")
      player.destroy()
    })
    .on("trackStuck", (player, track) => {
      client.info("Track Stuck")
      const channel = client.channels.cache.get(player.textChannelId)
      if (channel) channel.send(`Track Stuck! ${track.info.title}`)
      player.destroy()
    })
}
