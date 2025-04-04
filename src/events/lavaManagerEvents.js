/**
 * @param {import('../lib/BotClient.js').default} client
 */
export default async (client) => {
  // TODO: DEFINE EVENTS
  client.lavalink
    .on("playerCreate", (player) => {})
    .on("trackStart", (player, track, payload) => {
      client.log("Track started")
      const channel = client.channels.cache.get(player.textChannelId)
      if (channel) channel.send(`Now playing: ${track.info.title}`)
    })
    .on("queueEnd", (player) => {
      client.log("Queue Ended")
      const channel = client.channels.cache.get(player.textChannelId)
      if (channel) channel.send("Queue has ended!")
      player.destroy()
    })
    .on("trackStuck", (player, track, payload) => {})
}
