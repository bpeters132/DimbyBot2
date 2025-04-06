/**
 * @param {import('../lib/BotClient.js').default} client
 */
export default async (client) => {
  client.lavalink.nodeManager
    .on("raw", (node, payload) => {
      // console.debug(`${node.id}, RAW: ${console.dir(payload)}`);
    })
    .on("disconnect", (node, reason) => {
      client.warn(`${node.id} DISCONNECT: ${console.dir(reason)}`)
    })
    .on("connect", (node) => {
      client.log(`${node.id} CONNECTED`)
    })
    .on("reconnecting", (node) => {
      client.warn(`${node.id} RECONNECTING`)
    })
    .on("create", (node) => {
      client.log(`${node.id} CREATED`)
    })
    .on("destroy", (node) => {
      client.warn(`${node.id} DESTROYED`)
    })
    .on("error", (node, error, payload) => {
      client.client.error(`${node.id} ERRORED: ${error}, PAYLOAD: ${console.dir(payload)}`)
    })
}
