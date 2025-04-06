/**
 * @param {import('../lib/BotClient').default} client
 */
export default async (client) => {
  client.on("raw", (data) => {
    client.lavalink.sendRawData(data)
  })
}
