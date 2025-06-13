import { SlashCommandBuilder, MessageFlags } from "discord.js"
import { stopLocalPlayer, getLocalPlayerState } from "../../util/localPlayer.js"

export default {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop the player and clear the queue"),
  /**
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   */
  async execute(interaction, client) {
    const guild = interaction.guild

    let stoppedLocal = false
    let stoppedLavalink = false

    // Attempt to stop local player
    const localPlayerWasActive = getLocalPlayerState(guild.id)?.isPlaying || false
    if (localPlayerWasActive) {
      if (stopLocalPlayer(client, guild.id)) {
        client.debug(`[StopCmd] Stopped local player for guild ${guild.id}`)
        stoppedLocal = true
      }
    }

    // Attempt to stop Lavalink player
    const lavalinkPlayer = client.lavalink.players.get(guild.id)
    if (lavalinkPlayer) {
      // Check if it was actually doing something or had a queue
      if (lavalinkPlayer.playing || lavalinkPlayer.queue.current || lavalinkPlayer.queue.tracks.length > 0) {
        lavalinkPlayer.destroy()
        client.debug(`[StopCmd] Destroyed Lavalink player for guild ${guild.id}`)
        stoppedLavalink = true
      } else {
        // If Lavalink player exists but isn't active and has no queue, still destroy to clean up resources if desired,
        // or just note it wasn't actively playing.
        lavalinkPlayer.destroy()
        client.debug(`[StopCmd] Cleaned up inactive Lavalink player for guild ${guild.id}`)
      }
    }

    let replyContent = "Nothing was playing."
    if (stoppedLocal && stoppedLavalink) {
      replyContent = "⏹️ All playback stopped and queue cleared."
    } else if (stoppedLocal) {
      replyContent = "⏹️ Local playback stopped."
    } else if (stoppedLavalink) {
      replyContent = "⏹️ Lavalink playback stopped and queue cleared."
    } else if (localPlayerWasActive && !stoppedLocal) {
      replyContent = "Could not stop the local player. Please check logs."
    } else if (lavalinkPlayer && !stoppedLavalink && (lavalinkPlayer.playing || lavalinkPlayer.queue.current)) {
      replyContent = "Could not stop the Lavalink player. Please check logs."
    }

    // Use fetchReply to get the message object for potential deletion
    const msg = await interaction.reply({ 
      content: replyContent, 
      fetchReply: true, 
      flags: (replyContent === "Nothing was playing.") ? [MessageFlags.Ephemeral] : [] 
    })

    // Auto-delete reply only if something was actually stopped
    if (stoppedLocal || stoppedLavalink) {
      setTimeout(() => {
        msg.delete().catch((e) => {
          client.error("[StopCmd] Failed to delete reply (attempt 1):", e)
          if (e.code === 'EAI_AGAIN' || e.message.includes('ECONNRESET')) {
            setTimeout(() => {
              msg.delete().catch((e2) => client.error("[StopCmd] Failed to delete reply (attempt 2):", e2))
            }, 2000)
          }
        })
      }, 5000) // 5 seconds delay for stop confirmation
    }
  },
}
