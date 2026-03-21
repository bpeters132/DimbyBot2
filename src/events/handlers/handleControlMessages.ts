import {
  PermissionsBitField,
  MessageType,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import { handleQueryAndPlay } from "../../util/musicManager.js"

export default async function handleControlMessages(client: BotClient, message: Message) {
  if (!message.member) {
    return
  }
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

  const guildId = message.guildId
  if (!guildId) return

  const { channel, member, content } = message
  if (!channel.isTextBased() || channel.isDMBased()) return
  const sendChannel = channel as GuildTextBasedChannel

  let feedbackMessage: Message | null = null
  const botUser = client.user

  try {
    // 1. Check voice state
    const voiceChannel = member.voice.channel
    if (!voiceChannel) {
      client.debug(
        `[ControlHandler] User ${member.id} is not in a voice channel in guild ${guildId}.`
      )
      feedbackMessage = await sendChannel.send(
        `${member}, you need to be in a voice channel to play music.`
      )
      return // Cleanup happens in finally
    }
    client.debug(`[ControlHandler] User ${member.id} is in voice channel ${voiceChannel.id}.`)

    // 2. Check permissions
    if (!botUser) return
    const permissions = voiceChannel.permissionsFor(botUser)
    if (
      !permissions?.has(PermissionsBitField.Flags.Connect) ||
      !permissions?.has(PermissionsBitField.Flags.Speak)
    ) {
      client.warn(
        `[ControlHandler] Missing Connect/Speak permissions for VC ${voiceChannel.id} in guild ${guildId}.`
      )
        feedbackMessage = await sendChannel.send(
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
        guildId,
        voiceChannelId: voiceChannel.id,
        textChannelId: sendChannel.id,
        selfDeaf: true,
        volume: 100, // TODO: Make volume configurable?
      })
      client.debug(`[ControlHandler] Created Lavalink player for guild ${guildId}.`)
    } else {
      client.debug(
        `[ControlHandler] Found existing player for guild ${guildId}. Connected: ${player.connected}`
      )
    }

    if (!player) {
      feedbackMessage = await sendChannel.send(
        `${member}, Could not start the music player. Try again in a moment.`
      )
      return
    }

    if (!player.connected) {
      client.debug(
        `[ControlHandler] Player not connected for guild ${guildId}. Attempting connection to VC ${voiceChannel.id}.`
      )
      try {
        await player.connect()
        client.debug(
          `[ControlHandler] Player successfully connected to VC ${voiceChannel.id} in guild ${guildId}.`
        )
      } catch (connectError: unknown) {
        client.error(`[ControlHandler] Player failed to connect in guild ${guildId}:`, connectError)
        feedbackMessage = await sendChannel.send(
          `${member}, I couldn't connect to your voice channel.`
        )
        return
      }
    } else if (player.voiceChannelId !== voiceChannel.id) {
      // If the user is in a different VC than the bot
      client.warn(
        `[ControlHandler] User ${member.id} in VC ${voiceChannel.id}, but player is in VC ${player.voiceChannelId} for guild ${guildId}.`
      )
      const otherVc = player.voiceChannelId
        ? client.channels.cache.get(player.voiceChannelId)
        : undefined
      const otherName =
        otherVc && "name" in otherVc && typeof (otherVc as { name: string }).name === "string"
          ? (otherVc as { name: string }).name
          : "Unknown Channel"
      feedbackMessage = await sendChannel.send(
        `${member}, I'm already playing in another voice channel (${otherName}).`
      )
      return
    }
    client.debug(`[ControlHandler] Player connected status checked/handled for guild ${guildId}.`)

    // 5, 6, 7: Use the centralized handler
    const result = await handleQueryAndPlay(
      client,
      guildId,
      voiceChannel,
      sendChannel,
      content,
      message.author,
      player
    )

    client.debug(
      `[ControlHandler] handleQueryAndPlay result for guild ${guildId}: Success=${result.success}, Feedback="${result.feedbackText}"`
    )

    // Send feedback from the result
    if (result.feedbackText) {
      feedbackMessage = await sendChannel.send(result.feedbackText)
    }
    // Note: updateControlMessage is called inside handleQueryAndPlay if needed.
  } catch (error: unknown) {
    client.error(
      `[ControlHandler] Uncaught error processing message in control channel for guild ${guildId}:`,
      error
    )
    try {
      if (feedbackMessage) {
        await feedbackMessage.delete().catch(() => {})
      }
      feedbackMessage = await sendChannel.send(
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
      const botPermissions = botUser ? sendChannel.permissionsFor(botUser) : null
      if (botPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
        try {
          await message.delete()
          client.debug(
            `[ControlHandler] Deleted user query message ${message.id} in guild ${guildId}.`
          )
        } catch {
          client.debug(
            `[ControlHandler] User query message ${message.id} already deleted or missing in guild ${guildId}.`
          )
        }
      } else {
        client.warn(
          `[ControlHandler] Missing ManageMessages permission in control channel ${sendChannel.id} for guild ${guildId}, cannot delete query.`
        )
      }
    } catch (deleteError: unknown) {
      const de = deleteError as { code?: number; message?: string }
      // Log specific errors if deletion fails for reasons other than missing permissions or message already gone
      if (de.code !== 10008) {
        // 10008: Unknown Message
        client.warn(
          `[ControlHandler] Failed to delete query message ${message.id} in guild ${guildId}: ${de.message} (Code: ${de.code})`
        )
      } else {
        client.warn(`[ControlHandler] Attempted to delete already deleted message ${message.id}.`)
      }
    }

    // 10. Delete feedback message after a delay
    if (feedbackMessage) {
      const fm = feedbackMessage
      client.debug(
        `[ControlHandler] Scheduling deletion for feedback message ${fm.id} in guild ${guildId}.`
      )
      setTimeout(async () => {
        try {
          try {
            await fm.delete()
            client.debug(`[ControlHandler] Deleted feedback message ${fm.id} in guild ${guildId}.`)
          } catch {
            /* already gone */
          }
        } catch (feedbackDeleteError: unknown) {
          const fe = feedbackDeleteError as { code?: number; message?: string }
          if (fe.code !== 10008) {
            client.warn(
              `[ControlHandler] Failed to delete feedback message ${fm.id}: ${fe.message}`
            )
          }
        }
      }, 5000)
    }
    client.debug(
      `[ControlHandler] Exiting finally block for message ${message.id} in guild ${guildId}.`
    )
  }
}
