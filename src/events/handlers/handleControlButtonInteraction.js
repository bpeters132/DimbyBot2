import { getGuildSettings } from "../../util/guildSettings.js"
import { updateControlMessage } from "./handleControlChannel.js"
/**
 * Handles button interactions originating from the control message.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('../../lib/BotClient.js').default} client
 */
export async function handleControlButtonInteraction(interaction, client) {
  const { customId, guildId, message, channelId } = interaction
  client.debug(
    `[ControlButtonHandler] Handling button interaction: ${customId} in guild ${guildId}`
  )

  const guildSettings = getGuildSettings()
  const settings = guildSettings[guildId]

  // 1. Check if it's the correct control channel
  if (!settings || !settings.controlChannelId || channelId !== settings.controlChannelId) {
    client.warn(
      `[ControlButtonHandler] Button interaction ${customId} received outside configured control channel (${settings?.controlChannelId ?? "N/A"}) in guild ${guildId}. Ignoring.`
    )
    try {
      await interaction.reply({
        content: "Please use player controls in the designated channel.",
        ephemeral: true,
      })
    } catch {
      /* Ignore */
    }
    return
  }
  client.debug(
    `[ControlButtonHandler] Button ${customId} received in correct control channel ${channelId}.`
  )

  // 2. Check if it's the correct control message
  if (!settings.controlMessageId || message.id !== settings.controlMessageId) {
    client.warn(
      `[ControlButtonHandler] Button interaction ${customId} received on message (${message.id}) other than configured control message (${settings.controlMessageId}) in guild ${guildId}. Ignoring.`
    )
    try {
      await interaction.reply({
        content: "This control message seems outdated. Try running /control-channel set again.",
        ephemeral: true,
      })
    } catch {
      /* Ignore */
    }
    return
  }
  client.debug(
    `[ControlButtonHandler] Button ${customId} received on correct control message ${message.id}.`
  )

  // 3. Get Player
  const player = client.lavalink?.getPlayer(guildId)
  if (!player) {
    client.warn(
      `[ControlButtonHandler] Player not found for guild ${guildId} when handling button ${customId}.`
    )
    // Update the control message to reflect the stopped state
    await updateControlMessage(client, guildId)
    try {
      await interaction.reply({
        content: "Player not found. It might have been stopped or disconnected.",
        ephemeral: true,
      })
    } catch {
      /* Ignore */
    }
    return
  }
  client.debug(
    `[ControlButtonHandler] Found player for guild ${guildId}. State: ${player.state}, Playing: ${player.playing}`
  )

  // 4. Defer Interaction
  try {
    await interaction.deferUpdate()
    client.debug(`[ControlButtonHandler] Interaction ${customId} deferred successfully.`)
  } catch (deferError) {
    client.error(
      `[ControlButtonHandler] Error deferring update for ${customId} interaction:`,
      deferError
    )
    // If defer fails, we probably can't proceed reliably
    return
  }

  // 5. Execute Action & Update Control Message
  let actionTaken = false
  try {
    client.debug(`[ControlButtonHandler] Executing action for ${customId}`)
    switch (customId) {
      case "control_play_pause": {
        if (!player.queue.current) {
          client.warn("[ControlButtonHandler] Play/Pause clicked but no current track.")
          break
        }
        if (player.playing) {
          client.debug("[ControlButtonHandler] Player is playing. Attempting to pause.")
          try {
            await player.pause()
            client.debug("[ControlButtonHandler] Player paused.")
            actionTaken = true
          } catch (pauseError) {
            // Handle specific error potentially thrown even when trying to pause
            if (pauseError.message === "Player is already paused - not able to pause.") {
              client.warn(`[ControlButtonHandler] Caught '${pauseError.message}' when trying to pause. Assuming already paused.`)
              // Even if it errored, the state is likely 'paused', so consider the action taken
              actionTaken = true
            } else {
              client.error("[ControlButtonHandler] Error pausing player:", pauseError)
              throw pauseError // Re-throw unexpected errors
            }
          }
        } else {
          // Player is not playing
          if (player.paused) {
            client.debug("[ControlButtonHandler] Player is paused. Attempting to resume.")
            try {
                await player.resume()
                client.debug("[ControlButtonHandler] Player resumed.")
                actionTaken = true
            } catch (resumeError) {
                // It's less likely the 'already paused' error occurs with resume(), but keep check just in case
                if (resumeError.message === "Player is already paused - not able to pause.") {
                    client.warn(`[ControlButtonHandler] Caught '${resumeError.message}' when trying to resume. Assuming already playing or command had no effect.`)
                    // Consider the action taken even if this error occurs, as the intent was to resume
                    actionTaken = true
                } else {
                    client.error("[ControlButtonHandler] Error resuming player:", resumeError)
                    throw resumeError // Re-throw unexpected errors
                }
            }
          } else {
            // Player is stopped/idle, try to play the current track
            client.debug(
              "[ControlButtonHandler] Player is stopped/idle. Attempting to play current track."
            )
            try {
              if (!player.connected) {
                client.warn(
                  "[ControlButtonHandler] Play attempt when player not connected. Checking user VC."
                )
                const voiceChannel = interaction.member?.voice?.channel
                if (voiceChannel && voiceChannel.id === player.voiceChannelId) {
                  client.debug(
                    "[ControlButtonHandler] User in correct VC, attempting player reconnect."
                  )
                  await player.connect()
                  client.debug("[ControlButtonHandler] Reconnected player.")
                } else {
                  client.error(
                    `[ControlButtonHandler] Cannot play, player not connected. User VC: ${voiceChannel?.id ?? "None"}, Player expected VC: ${player.voiceChannelId}`
                  )
                  await interaction.followUp({
                    content:
                      "I seem to be disconnected or you're not in my channel. Please try adding a song again or use /join.",
                    ephemeral: true,
                  })
                  break // Don't try to play
                }
              }
              await player.play()
              client.debug("[ControlButtonHandler] Player started playing.")
              actionTaken = true
            } catch (playError) {
              client.error(
                "[ControlButtonHandler] Error trying to play current track on stopped player:",
                playError
              )
              throw playError // Re-throw to be caught by the outer handler
            }
          }
        }
        break
      }
      case "control_stop": {
        await player.stop()
        client.debug("[ControlButtonHandler] Player stopped")
        actionTaken = true
        break
      }
      case "control_skip": {
        if (!player.queue.current) {
          client.warn("[ControlButtonHandler] Skip clicked but no current track.")
          break
        }
        await player.skip()
        client.debug("[ControlButtonHandler] Track skipped")
        actionTaken = true
        break
      }
      default: {
        client.warn(`[ControlButtonHandler] Unknown control button customId: ${customId}`)
        break
      }
    }

    // 6. Update Control Message if action was taken
    if (actionTaken) {
      client.debug(`[ControlButtonHandler] Action ${customId} completed, updating control message.`)
      // No need to await this, let it run in the background
      updateControlMessage(client, guildId).catch((err) =>
        client.error(
          `[ControlButtonHandler] Error updating control message after action ${customId}:`,
          err
        )
      )
    } else {
      client.debug(`[ControlButtonHandler] No action taken for ${customId}, not updating message.`)
    }
  } catch (playerError) {
    client.error(
      `[ControlButtonHandler] Error executing player action for ${customId}:`,
      playerError
    )
    try {
      // Attempt to notify user about the error
      await interaction.followUp({
        content: "An error occurred while controlling the player.",
        ephemeral: true,
      })
    } catch (followUpError) {
      client.error(`[ControlButtonHandler] Failed to send player error follow-up:`, followUpError)
    }
    // Attempt to update the control message even after an error
    client.debug(
      `[ControlButtonHandler] Updating control message after player error for ${customId}.`
    )
    updateControlMessage(client, guildId).catch((err) =>
      client.error(
        `[ControlButtonHandler] Error updating control message after player error ${customId}:`,
        err
      )
    )
  }
}
