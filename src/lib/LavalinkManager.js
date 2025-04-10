import { LavalinkManager } from "lavalink-client"
import { nodes } from "../../lavaNodesConfig.js"

/**
 *
 * @param {import('./BotClient.js').default} client
 */
export default function createLavalinkManager(client) {
  client.debug("Creating LavalinkManager instance.") // Debug log
  const manager = new LavalinkManager({
    nodes,
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    autoSkip: true,
    client: {
      id: process.env.CLIENT_ID,
      username: "DimbyBot", // TODO: add this to ENV
    },
  })
  client.debug("LavalinkManager instance created successfully.") // Debug log
  return manager
}
