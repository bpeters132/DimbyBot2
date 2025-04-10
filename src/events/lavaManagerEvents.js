/**
 * @fileoverview This file sets up event listeners for the main Lavalink Manager.
 * It handles events related to player creation/destruction, track playback,
 * queue management, voice channel interactions, player state changes, and debugging.
 * @see https://tomato6966.github.io/lavalink-client/api/types/manager/interfaces/lavalinkmanagerevents/
 */

// Import utility functions
import { getGuildSettings } from '../util/saveControlChannel.js'
import { updateControlMessage } from '../events/handlers/handleControlChannel.js'


/**
 * Sets up event listeners for the Lavalink Manager.
 * @param {import('../lib/BotClient.js').default} client The bot client instance.
 */
export default async (client) => {
  client.lavalink
    /**
     * Player Lifecycle Events
     */
    .on("playerCreate", (player) => {
      client.debug(`[LavaMgrEvents] Player created for Guild: ${player.guildId}`)
    })
    .on("playerDestroy", (player, reason) => {
      client.debug(
        `[LavaMgrEvents] Player destroyed for Guild: ${player.guildId}, Reason: ${reason}`
      )
      updateControlMessage(client, player.guildId)
    })
    .on("playerDisconnect", (player, oldChannelId) => {
      client.debug(
        `[LavaMgrEvents] Player disconnected from Guild: ${player.guildId}, Old Channel: ${oldChannelId}`
      )
      updateControlMessage(client, player.guildId)
    })
    .on("playerMove", (player, oldChannelId, newChannelId) => {
      client.debug(
        `[LavaMgrEvents] Player moved in Guild: ${player.guildId}, Old: ${oldChannelId}, New: ${newChannelId}`
      )
      // updateControlMessage(client, player.guildId) // Optional update
    })

    /**
     * Track Playback Events
     */
    .on("trackStart", (player, track) => {
      client.debug(
        `[LavaMgrEvents] Track started in Guild: ${player.guildId}, Title: ${track.info.title}`
      )
      updateControlMessage(client, player.guildId)

      const channel = client.channels.cache.get(player.textChannelId)
      // Check if textChannelId exists and is different from control channel before sending
      const currentGuildSettings = getGuildSettings() // Use imported function
      const controlChannelId = currentGuildSettings[player.guildId]?.controlChannelId
      if (channel && player.textChannelId !== controlChannelId) {
        client.debug(
          `[LavaMgrEvents] Sending trackStart message to non-control channel ${player.textChannelId} in guild ${player.guildId}.`
        )
        channel
          .send(`▶️ Now playing: **${track.info.title}**`)
          .catch((e) => client.error("[LavaMgrEvents] Failed to send trackStart message:", e))
      } else {
        client.debug(
          `[LavaMgrEvents] Not sending trackStart message for guild ${player.guildId} (channel ${player.textChannelId}, control ${controlChannelId}).`
        )
      }
    })
    .on("trackEnd", (player, track, payload) => {
      client.debug(
        `[LavaMgrEvents] Track ended in Guild: ${player.guildId}, Track: ${track?.info?.title ?? "N/A"}, Reason: ${payload.reason}`
      )
      // Update should happen even if auto-play starts next track
      updateControlMessage(client, player.guildId)
    })
    .on("trackStuck", (player, track, payload) => {
      client.warn(
        `[LavaMgrEvents] Track stuck in Guild: ${player.guildId}, Track: ${track?.info?.title ?? "N/A"}, Threshold: ${payload.thresholdMs}`
      )
      updateControlMessage(client, player.guildId)

      const channel = client.channels.cache.get(player.textChannelId)
      const currentGuildSettings = getGuildSettings() // Use imported function
      const controlChannelId = currentGuildSettings[player.guildId]?.controlChannelId
      if (channel && player.textChannelId !== controlChannelId) {
        client.debug(
          `[LavaMgrEvents] Sending trackStuck message to non-control channel ${player.textChannelId} in guild ${player.guildId}.`
        )
        channel
          .send(`⚠️ Track Stuck! **${track.info.title}**`)
          .catch((e) => client.error("[LavaMgrEvents] Failed to send trackStuck message:", e))
      }
      client.debug(`[LavaMgrEvents] Attempting to skip stuck track in guild ${player.guildId}.`)
      player.skip()
    })
    .on("trackError", (player, track, payload) => {
      client.error(
        `[LavaMgrEvents] Track error in Guild: ${player.guildId}, Track: ${track?.info?.title ?? "Unknown Track"}`,
        payload
      )
      updateControlMessage(client, player.guildId)

      const channel = client.channels.cache.get(player.textChannelId)
      const currentGuildSettings = getGuildSettings() // Use imported function
      const controlChannelId = currentGuildSettings[player.guildId]?.controlChannelId
      if (channel && player.textChannelId !== controlChannelId) {
        client.debug(
          `[LavaMgrEvents] Sending trackError message to non-control channel ${player.textChannelId} in guild ${player.guildId}.`
        )
        channel
          .send(
            `❌ Error playing **${track?.info?.title ?? "the track"}**: ${payload.exception?.message || "Unknown error"}`
          )
          .catch((e) => client.error("[LavaMgrEvents] Failed to send trackError message:", e))
      }
      client.debug(
        `[LavaMgrEvents] Attempting to skip track after error in guild ${player.guildId}.`
      )
      player.skip()
    })

    /**
     * Queue Events
     */
    .on("queueEnd", (player) => {
      client.debug(`[LavaMgrEvents] Queue ended for Guild: ${player.guildId}`)
      updateControlMessage(client, player.guildId)

      const channel = client.channels.cache.get(player.textChannelId)
      const currentGuildSettings = getGuildSettings() // Use imported function
      const controlChannelId = currentGuildSettings[player.guildId]?.controlChannelId
      if (channel && player.textChannelId !== controlChannelId) {
        client.debug(
          `[LavaMgrEvents] Sending queueEnd message to non-control channel ${player.textChannelId} in guild ${player.guildId}.`
        )
        channel
          .send("⏹️ Queue has ended!")
          .catch((e) => client.error("[LavaMgrEvents] Failed to send queueEnd message:", e))
      }

      client.debug(
        `[LavaMgrEvents] Setting timeout to destroy player ${player.guildId} after queue end.`
      ) // Log timeout set
      setTimeout(() => {
        client.debug(
          `[LavaMgrEvents] Executing queue end timeout check for player ${player.guildId}.`
        )
        if (player && player.queue.tracks.length === 0 && !player.queue.current) {
          client.debug(
            `[LavaMgrEvents] Player ${player.guildId} is idle, destroying after queue end timeout.`
          )
          player.destroy()
        } else {
          client.debug(
            `[LavaMgrEvents] Player ${player.guildId} has new tracks or state changed, not destroying after queue end timeout. Player: ${!!player}, Queue Size: ${player?.queue.tracks.length}, Current: ${!!player?.queue.current}`
          ) // More detail
        }
      }, 5000)
    })

    /**
     * Voice Channel User Events
     */
    .on("playerVoiceJoin", (player, userId) => {
      client.debug(
        `[LavaMgrEvents] User joined player's channel: Guild ${player.guildId}, User: ${userId}`
      )
    })
    .on("playerVoiceLeave", (player, userId) => {
      client.debug(
        `[LavaMgrEvents] User left player's channel: Guild ${player.guildId}, User: ${userId}`
      )
      const voiceChannel = client.channels.cache.get(player.voiceChannelId)
      if (voiceChannel) {
        client.debug(
          `[LavaMgrEvents] Setting timeout to check if bot is alone in VC ${player.voiceChannelId} for guild ${player.guildId}.`
        )
        setTimeout(async () => {
          client.debug(
            `[LavaMgrEvents] Executing check if bot is alone for player ${player.guildId}.`
          )
          try {
            const updatedVoiceChannel = await client.channels
              .fetch(player.voiceChannelId)
              .catch(() => null)
            if (updatedVoiceChannel && updatedVoiceChannel.isVoiceBased()) {
              const humanMembers = updatedVoiceChannel.members.filter((m) => !m.user.bot)
              client.debug(
                `[LavaMgrEvents] Current human member count in VC ${player.voiceChannelId}: ${humanMembers.size}`
              ) // Log count
              if (humanMembers.size === 0) {
                client.info(
                  `[LavaMgrEvents] Destroying player in Guild ${player.guildId} as bot is alone.`
                )
                await updateControlMessage(client, player.guildId) // Update before destroy
                player.destroy()
              }
            } else {
              client.warn(
                `[LavaMgrEvents] Could not verify member count for player ${player.guildId}. Channel ${player.voiceChannelId} not found or not voice-based.`
              )
            }
          } catch (error) {
            client.error(
              `[LavaMgrEvents] Error checking channel members for player ${player.guildId}:`,
              error
            )
          }
        }, 5000)
      }
    })

    /**
     * Player State Change Events
     */
    .on("playerSocketClosed", (player, payload) => {
      client.warn(`[LavaMgrEvents] Player WebSocket closed for Guild: ${player.guildId}`, payload)
      updateControlMessage(client, player.guildId)
    })
    .on("playerSuppressChange", (player, suppress) => {
      client.debug(
        `[LavaMgrEvents] Player suppress state changed for Guild: ${player.guildId}, Suppressed: ${suppress}`
      )
    })
    .on("playerUpdate", (/* oldPlayerJson, newPlayer */) => {
      // Still too frequent for logging generally
    })

    /**
     * Debug Event
     */
    .on("debug", (eventKey /*, eventData */) => {
      client.debug(`[LavaMgrEvents] Lavalink Manager Internal Debug: ${eventKey}`)
    })
}
