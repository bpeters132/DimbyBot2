import { getGuildSettings } from "../../util/saveControlChannel.js"
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
      })
    } catch {
      /* Ignore */
    }
    return
  }
  client.debug(
    `[ControlButtonHandler] Found player for guild ${guildId}. State: ${player.state}, Playing: ${player.playing}`
  )

  // 4. Voice Channel Check
  const member = interaction.member
  if (!member?.voice?.channel) {
    client.debug(`[ControlButtonHandler] User ${interaction.user.id} not in a voice channel.`)
    try {
      await interaction.reply({ content: "You must be in a voice channel to use the controls!", ephemeral: true })
    } catch (e) { client.error("Error replying to VC check fail:", e) }
    return
  }
  if (!player.voiceChannelId) {
    client.warn(`[ControlButtonHandler] Player for guild ${guildId} exists but has no voiceChannelId. Cannot verify user channel.`)
    // Allow control anyway? Or deny? Let's deny for now for consistency.
    try {
      await interaction.reply({ content: "Cannot verify player's voice channel. Controls unavailable.", ephemeral: true })
    } catch (e) { client.error("Error replying to player VC check fail:", e) }
    return
  }
  if (member.voice.channel.id !== player.voiceChannelId) {
    client.debug(`[ControlButtonHandler] User ${interaction.user.id} in different VC (${member.voice.channel.id}) than player (${player.voiceChannelId}).`)
    try {
      await interaction.reply({ content: "You must be in the same voice channel as the bot to use the controls!", ephemeral: true })
    } catch (e) { client.error("Error replying to mismatched VC check fail:", e) }
    return
  }
  client.debug(`[ControlButtonHandler] User ${interaction.user.id} is in the correct voice channel (${player.voiceChannelId}).`)

  // 5. Defer Interaction
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

  // 6. Execute Action & Update Control Message
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
              client.warn(
                `[ControlButtonHandler] Caught '${pauseError.message}' when trying to pause. Assuming already paused.`
              )
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
                client.warn(
                  `[ControlButtonHandler] Caught '${resumeError.message}' when trying to resume. Assuming already playing or command had no effect.`
                )
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
        await player.destroy()
        await interaction.followUp('BYE!')
        client.debug("[ControlButtonHandler] Player stopped")
        actionTaken = true
        break
      }
      case "control_skip": {
        const hadCurrentTrack = !!player.queue.current // Check if there *was* a track before skipping
        if (!hadCurrentTrack) {
          client.warn("[ControlButtonHandler] Skip clicked but no current track was playing.")
          await interaction.followUp({
            content: "Nothing is currently playing to skip.",
          })
          break // Don't set actionTaken, nothing changed
        }

        try {
          client.debug("[ControlButtonHandler] Attempting player.skip().")
          await player.skip() // Execute the skip
          client.debug("[ControlButtonHandler] player.skip() completed successfully.")
          actionTaken = true // Skip succeeded without error (more tracks were in queue)
        } catch (skipError) {
          // Check if the error is the specific RangeError expected when skipping the last track
          const isLastTrackSkipError =
            skipError instanceof RangeError &&
            skipError.message === "Can't skip more than the queue size"

          if (isLastTrackSkipError) {
            client.warn(
              `[ControlButtonHandler] player.skip() threw expected RangeError for last track: ${skipError.message}. Treating as stop.`
            )
            // The skip effectively stopped the player by trying to skip the last track.
            // The player state should now reflect 'stopped', and queue.current should be null/undefined.
            await interaction.followUp({
              content: "Skipped the track. The queue is now empty.",
            })

            player.destroy()
            actionTaken = true // Mark action as taken because the desired outcome (stopping) occurred.
            
          } else {
            // This is an unexpected error during skip
            client.error("[ControlButtonHandler] Unexpected error during player.skip():", skipError)
            // Re-throw the error to be caught by the outer try-catch block that sends a generic error message.
            throw skipError
          }
        }

        // This block now executes if skip() succeeded OR threw the caught error
        if (actionTaken) {
          // Check the player's state *after* the skip attempt.
          // If skip() succeeded or threw the caught error, player.queue.current should be null/undefined.
          if (!player.queue.current) {
            client.debug("[ControlButtonHandler] Queue is empty after skip action.")
            // Send a specific message indicating the queue ended
            try {
              // Use interaction.followUp since we deferred earlier
              // This message is now sent within the isLastTrackSkipError block if applicable
              // If skip succeeded normally, the control message update is enough
            } catch (followUpError) {
              client.error(
                '[ControlButtonHandler] Failed to send "queue empty after skip" follow-up:',
                followUpError
              )
            }
          } else {
            // This case should ideally not happen if skip() worked correctly on the last track
            // or if the specific error was caught, but log just in case.
            client.debug(
              `[ControlButtonHandler] Next track exists after skip: ${player.queue.current?.info?.title ?? "N/A"}`
            )
          }
        }
        // If an unexpected error was thrown, actionTaken remains false, and the outer catch handles the reply.

        break
      }
      case "control_shuffle": {
        // player.queue.size is the number of tracks *upcoming*, doesn't include current
        if (!player.queue || player.queue.size < 1) {
          client.debug("[ControlButtonHandler] Shuffle clicked but not enough tracks in queue.")
          await interaction.followUp({ content: "Not enough songs in the queue to shuffle." })
          break // Don't set actionTaken
        }
        try {
          player.queue.shuffle()
          client.debug("[ControlButtonHandler] Queue shuffled.")
          await interaction.followUp({ content: "🔀 Queue shuffled." })
          actionTaken = true
        } catch (shuffleError) {
          client.error("[ControlButtonHandler] Error shuffling queue:", shuffleError)
          // Optionally, inform the user about the error
          await interaction.followUp({ content: "An error occurred while trying to shuffle." }).catch(() => {})
          // Don't re-throw here unless it's critical, let the control message update attempt happen
        }
        break
      }
      case "control_loop": {
        const currentLoop = player.loop || 'none' // 'none', 'track', 'queue'
        let newMode = 'none'
        let feedback = ''

        if (currentLoop === 'none') {
          newMode = 'track'
          feedback = 'Track loop 🔁 enabled.'
        } else if (currentLoop === 'track') {
          newMode = 'queue'
          feedback = 'Queue loop 🔁 enabled.'
        } else { // currentLoop === 'queue'
          newMode = 'none'
          feedback = 'Loop disabled.'
        }

        try {
          player.loop = newMode
          client.debug(`[ControlButtonHandler] Loop mode set to ${newMode}.`)
          await interaction.followUp({ content: feedback })
          actionTaken = true
        } catch (loopError) {
          client.error("[ControlButtonHandler] Error setting loop mode:", loopError)
          await interaction.followUp({ content: "An error occurred while setting loop mode." }).catch(() => {})
        }
        break
      }
      default: {
        client.warn(`[ControlButtonHandler] Unknown control button customId: ${customId}`)
        break
      }
    }

    // 7. Update Control Message if action was taken
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
      })
    } catch (followUpError) {
      client.error(`[ControlButtonHandler] Failed to send player error follow-up:`, followUpError)
    }
    // Attempt to update the control message even after an error
    client.warn(
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
