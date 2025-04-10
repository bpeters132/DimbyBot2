import { PermissionsBitField, MessageType } from "discord.js"
import { handleQueryAndPlay } from "../../util/musicManager.js" // Import the new handler

/**
 * Handles messages sent in the designated control channel for music commands.
 * @param {import('../../lib/BotClient.js').default} client The bot client instance.
 * @param {import('discord.js').Message} message The message received in the control channel.
 */
export default async function handleControlMessages(client, message) {
  // Ignore non-default message types (e.g., slash commands, replies without content)
  if (message.type !== MessageType.Default && message.type !== MessageType.Reply) {
      // Silently ignore interactions or system messages in this handler
      // Slash commands are handled by interactionCreate
      return
  }
  if (message.type === MessageType.Reply && !message.content) {
    // Ignore replies that only quote and don't add new content
    return
  }

  // Renamed function
  const { channel, member, content, guildId } = message
  let feedbackMessage = null

  try {
    // 1. Check voice state
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      client.debug(
        `[ControlHandler] User ${member.id} is not in a voice channel in guild ${guildId}.`
      )
      feedbackMessage = await channel.send(
        `${member}, you need to be in a voice channel to play music.`
      )
      return // Cleanup happens in finally
    }
    client.debug(`[ControlHandler] User ${member.id} is in voice channel ${voiceChannel.id}.`)

    // 2. Check permissions
    const permissions = voiceChannel.permissionsFor(client.user)
    if (
      !permissions?.has(PermissionsBitField.Flags.Connect) ||
      !permissions?.has(PermissionsBitField.Flags.Speak)
    ) {
      client.warn(
        `[ControlHandler] Missing Connect/Speak permissions for VC ${voiceChannel.id} in guild ${guildId}.`
      )
      feedbackMessage = await channel.send(
        `${member}, I need permissions to connect and speak in your voice channel.`
      )
      return
    }
    client.debug(`[ControlHandler] Bot has Connect/Speak permissions for VC ${voiceChannel.id}.`)

    // 3. Get/Create player
    let player = client.lavalink?.getPlayer(guildId)
    if (!player) {
      client.debug(`[ControlHandler] No existing player for guild ${guildId}. Creating one.`)
      player = client.lavalink?.createPlayer({
        guildId: guildId,
        voiceChannelId: voiceChannel.id,
        textChannelId: channel.id, // Bind to control channel
        selfDeaf: true,
        volume: 100, // TODO: Make volume configurable?
      })
      client.debug(`[ControlHandler] Created Lavalink player for guild ${guildId}.`)
    } else {
      client.debug(
        `[ControlHandler] Found existing player for guild ${guildId}. State: ${player.state}`
      )
    }

    // 4. Connect player
    if (!player.connected) {
      if (player.state === "CONNECTING" || player.state === "CONNECTED") {
        client.debug(
          `[ControlHandler] Player already connecting/connected in guild ${guildId}. State: ${player.state}`
        )
      } else {
        client.debug(
          `[ControlHandler] Player not connected for guild ${guildId}. Attempting connection to VC ${voiceChannel.id}.`
        )
        try {
          await player.connect()
          client.debug(
            `[ControlHandler] Player successfully connected to VC ${voiceChannel.id} in guild ${guildId}.`
          )
        } catch (connectError) {
          client.error(
            `[ControlHandler] Player failed to connect in guild ${guildId}:`,
            connectError
          )
          feedbackMessage = await channel.send(
            `${member}, I couldn't connect to your voice channel.`
          )
          // Consider destroying the player if connection fails permanently
          // player.destroy()?
          return
        }
      }
    } else if (player.voiceChannelId !== voiceChannel.id) {
      // If the user is in a different VC than the bot
      client.warn(
        `[ControlHandler] User ${member.id} in VC ${voiceChannel.id}, but player is in VC ${player.voiceChannelId} for guild ${guildId}.`
      )
      feedbackMessage = await channel.send(
        `${member}, I'm already playing in another voice channel (${client.channels.cache.get(player.voiceChannelId)?.name ?? "Unknown Channel"}).`
      )
      return
    }
    client.debug(`[ControlHandler] Player connected status checked/handled for guild ${guildId}.`)

    // 5, 6, 7: Use the centralized handler
    const result = await handleQueryAndPlay(
      client,
      guildId,
      voiceChannel,
      channel,
      content,
      message.author,
      player
    )

    client.debug(
      `[ControlHandler] handleQueryAndPlay result for guild ${guildId}: Success=${result.success}, Feedback="${result.feedbackText}"`
    )

    // Send feedback from the result
    if (result.feedbackText) {
      if (feedbackMessage && !feedbackMessage.deleted) {
        await feedbackMessage.delete().catch(() => {})
      }
      feedbackMessage = await channel.send(result.feedbackText)
    }
    // Note: updateControlMessage is called inside handleQueryAndPlay if needed.
  } catch (error) {
    client.error(
      `[ControlHandler] Uncaught error processing message in control channel for guild ${guildId}:`,
      error
    )
    try {
      // Ensure previous feedback is deleted before sending error message
      if (feedbackMessage && !feedbackMessage.deleted) {
        await feedbackMessage.delete().catch(() => {})
      }
      feedbackMessage = await channel.send(
        `${member}, An unexpected error occurred while processing your request.`
      )
    } catch {
      /* Ignore */
    }
  } finally {
    client.debug(
      `[ControlHandler] Entering finally block for message ${message.id} in guild ${guildId}.`
    )
    // 9. Delete user query
    try {
      // Check permissions before attempting deletion
      const botPermissions = channel.permissionsFor(client.user)
      if (botPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
        // Check if the message still exists before trying to delete
        if (!message.deleted) {
          await message.delete()
          client.debug(
            `[ControlHandler] Deleted user query message ${message.id} in guild ${guildId}.`
          )
        } else {
          client.debug(
            `[ControlHandler] User query message ${message.id} already deleted in guild ${guildId}.`
          )
        }
      } else {
        client.warn(
          `[ControlHandler] Missing ManageMessages permission in control channel ${channel.id} for guild ${guildId}, cannot delete query.`
        )
      }
    } catch (deleteError) {
      // Log specific errors if deletion fails for reasons other than missing permissions or message already gone
      if (deleteError.code !== 10008) {
        // 10008: Unknown Message
        client.warn(
          `[ControlHandler] Failed to delete query message ${message.id} in guild ${guildId}: ${deleteError.message} (Code: ${deleteError.code})`
        )
      } else {
        client.debug(`[ControlHandler] Attempted to delete already deleted message ${message.id}.`)
      }
    }

    // 10. Delete feedback message after a delay
    if (feedbackMessage && !feedbackMessage.deleted) {
      client.debug(
        `[ControlHandler] Scheduling deletion for feedback message ${feedbackMessage.id} in guild ${guildId}.`
      )
      setTimeout(async () => {
        try {
          // Check if feedback message still exists and wasn't deleted by error handling
          if (!feedbackMessage.deleted) {
            await feedbackMessage.delete()
            client.debug(
              `[ControlHandler] Deleted feedback message ${feedbackMessage.id} in guild ${guildId}.`
            )
          }
        } catch (feedbackDeleteError) {
          if (feedbackDeleteError.code !== 10008) {
            // 10008: Unknown Message
            client.warn(
              `[ControlHandler] Failed to delete feedback message ${feedbackMessage.id}: ${feedbackDeleteError.message}`
            )
          }
        }
      }, 5000) // 5 second delay
    }
    client.debug(
      `[ControlHandler] Exiting finally block for message ${message.id} in guild ${guildId}.`
    )
  }
}
