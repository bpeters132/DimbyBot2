import { getGuildSettings } from "../util/guildSettings.js"
import handleControlMessages from "./handlers/handleControlMessages.js"

/**
 * @param {import('../lib/BotClient.js').default} client
 */
export default (client) => {
  client.on("messageCreate", async (message) => {
    // Initial checks
    if (message.partial) {
      client.debug("[MessageCreate] Received partial message, attempting fetch.")
      try {
        await message.fetch()
        client.debug("[MessageCreate] Successfully fetched partial message.")
      } catch (error) {
        client.error("[MessageCreate] Error fetching partial message:", error)
        return
      }
    }
    if (message.author.bot) {
      // client.debug('[MessageCreate] Ignoring message from bot:', message.author.tag)
      return // Usually ignore bots
    }
    if (!message.guild) {
      client.debug("[MessageCreate] Ignoring DM message.")
      return // Ignore DMs
    }
    if (!message.content) {
      client.debug("[MessageCreate] Ignoring message with no content.")
      return // Ignore messages without content (e.g., embeds only from users)
    }

    const { channel, member, content, guildId } = message
    client.debug(
      `[MessageCreate] Received message in guild ${guildId}, channel ${channel.id} from user ${member.id}. Content: "${content.substring(0, 50)}..."`
    )

    // Check if it's the control channel
    const guildSettings = getGuildSettings()
    const settings = guildSettings[guildId]
    if (!settings || !settings.controlChannelId || channel.id !== settings.controlChannelId) {
      // client.debug(`[MessageCreate] Message not in control channel for guild ${guildId}. Configured: ${settings?.controlChannelId ?? 'None'}.`) // Can be noisy
      return
    }

    client.debug(
      `[MessageCreate] Message is in control channel ${channel.id} for guild ${guildId}. Processing as query: "${content}"`
    )

    // Pass the message to the dedicated handler
    handleControlMessages(client, message).catch((error) => {
      client.error(
        `[MessageCreate] Error bubbled up from control channel handler for guild ${guildId}:`,
        error
      )
      // Optionally send a generic error message back to the control channel if the handler failed catastrophically
      // message.channel.send(`${message.member}, A critical error occurred.`).catch(() => {});
    })
  })
}
