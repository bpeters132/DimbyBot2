import { LavalinkManager } from "lavalink-client"
import { nodes } from "../../lavaNodesConfig.js"

/**
 * Creates and configures the Lavalink manager instance for the bot.
 * @param {import('./BotClient.js').default} client The bot client instance.
 * @returns {import('lavalink-client').LavalinkManager} The configured Lavalink manager.
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
    sources: {
      youtube: true,
      spotify: true,
      soundcloud: true,
      local: true
    },
    defaultSearchPlatform: "local",
    searchOptions: {
      searchEngine: "local",
      fallbackSearchEngine: "youtube"
    }
  })
  client.debug("LavalinkManager instance created successfully.") // Debug log
  return manager
}
