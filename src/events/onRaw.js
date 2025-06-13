/**
 * @param {import('../lib/BotClient').default} client
 */
export default async (client) => {
  client.on("raw", (data) => {
    // client.info(`Raw event triggered`)
    client.lavalink.sendRawData(data)
  })
}
