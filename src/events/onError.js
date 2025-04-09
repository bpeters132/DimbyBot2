/**
 * @param {import('../lib/BotClient').default} client
 */
export default async (client) => {
  client.on("error", (err) => {
    client.info(`Error event triggered: ${err}`)
  })
}
