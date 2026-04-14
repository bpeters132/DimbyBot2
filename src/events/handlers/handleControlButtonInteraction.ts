import type { ButtonInteraction } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import { getGuildSettings, isGuildSettingsInitialized } from "../../util/saveControlChannel.js"
import { toggleAutoplay } from "../../util/autoplayHistory.js"
import { startPlaybackIfNeeded } from "../../util/musicManager.js"
import { updateControlMessage } from "./handleControlChannel.js"

export async function handleControlButtonInteraction(
    interaction: ButtonInteraction,
    client: BotClient
) {
    const { customId, guildId, message, channelId } = interaction
    if (!guildId) return
    client.debug(
        `[ControlButtonHandler] Handling button interaction: ${customId} in guild ${guildId}`
    )

    if (!isGuildSettingsInitialized()) {
        client.warn(
            `[ControlButtonHandler] Guild settings not initialized yet; ignoring button ${customId} in guild ${guildId}.`
        )
        try {
            await interaction.reply({
                content: "Bot is still starting up. Please try again in a moment.",
                ephemeral: true,
            })
        } catch {
            /* Ignore */
        }
        return
    }

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
                content:
                    "This control message seems outdated. Try running /control-channel set again.",
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

    const guild = interaction.guild
    if (!guild) return

    await interaction.deferUpdate()
    client.debug(`[ControlButtonHandler] Interaction ${customId} deferred successfully.`)

    const member =
        interaction.member && "voice" in interaction.member
            ? interaction.member
            : await guild.members.fetch(interaction.user.id)

    // 3. Get Player
    const player = client.lavalink?.getPlayer(guildId)
    if (!player) {
        client.warn(
            `[ControlButtonHandler] Player not found for guild ${guildId} when handling button ${customId}.`
        )
        await updateControlMessage(client, guildId)
        try {
            await interaction.followUp({
                content: "Player not found. It might have been stopped or disconnected.",
                ephemeral: true,
            })
        } catch {
            /* Ignore */
        }
        return
    }
    client.debug(
        `[ControlButtonHandler] Found player for guild ${guildId}. Connected: ${player.connected}, Playing: ${player.playing}`
    )

    // 4. Voice channel check (autoplay matches `/autoplay`; other controls require same VC as player when known)
    if (customId === "control_autoplay") {
        const voiceChannel = member.voice?.channel
        if (!voiceChannel) {
            client.debug(
                `[ControlButtonHandler] User ${interaction.user.id} not in VC for autoplay toggle.`
            )
            try {
                await interaction.followUp({
                    content: "Join a voice channel first!",
                    ephemeral: true,
                })
            } catch (e: unknown) {
                client.error("Error sending VC check follow-up:", e)
            }
            return
        }
        if (player.connected && player.voiceChannelId !== voiceChannel.id) {
            try {
                await interaction.followUp({
                    content: "You need to be in the same voice channel as the bot!",
                    ephemeral: true,
                })
            } catch (e: unknown) {
                client.error("Error sending VC mismatch follow-up:", e)
            }
            return
        }
    } else {
        if (!member.voice?.channel) {
            client.debug(
                `[ControlButtonHandler] User ${interaction.user.id} not in a voice channel.`
            )
            try {
                await interaction.followUp({
                    content: "You must be in a voice channel to use the controls!",
                    ephemeral: true,
                })
            } catch (e: unknown) {
                client.error("Error sending VC check follow-up:", e)
            }
            return
        }
        if (!player.voiceChannelId) {
            client.warn(
                `[ControlButtonHandler] Player for guild ${guildId} exists but has no voiceChannelId. Cannot verify user channel.`
            )
            try {
                await interaction.followUp({
                    content: "Cannot verify player's voice channel. Controls unavailable.",
                    ephemeral: true,
                })
            } catch (e: unknown) {
                client.error("Error sending player VC check follow-up:", e)
            }
            return
        }
        if (member.voice.channel.id !== player.voiceChannelId) {
            client.debug(
                `[ControlButtonHandler] User ${interaction.user.id} in different VC (${member.voice.channel.id}) than player (${player.voiceChannelId}).`
            )
            try {
                await interaction.followUp({
                    content:
                        "You must be in the same voice channel as the bot to use the controls!",
                    ephemeral: true,
                })
            } catch (e: unknown) {
                client.error("Error sending mismatched VC follow-up:", e)
            }
            return
        }
        client.debug(
            `[ControlButtonHandler] User ${interaction.user.id} is in the correct voice channel (${player.voiceChannelId}).`
        )
    }

    // 5. Execute Action & Update Control Message
    let actionTaken = false
    /**
     * Sends a follow-up and refreshes the control message when a player action fails.
     * @param {Error} error The error thrown by the player action.
     * @returns {Promise<void>}
     */
    const handleActionError = async (error: unknown) => {
        client.error(`[ControlButtonHandler] Error executing player action for ${customId}:`, error)
        try {
            await interaction.followUp({
                content: "An error occurred while controlling the player.",
                ephemeral: true,
            })
        } catch (followUpError) {
            client.error(
                `[ControlButtonHandler] Failed to send player error follow-up:`,
                followUpError
            )
        }
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
                    } catch (pauseError: unknown) {
                        const pe =
                            pauseError instanceof Error ? pauseError.message : String(pauseError)
                        if (pe.includes("already paused")) {
                            client.warn(
                                `[ControlButtonHandler] Caught '${pe}' when trying to pause. Assuming already paused.`
                            )
                            // Even if it errored, the state is likely 'paused', so consider the action taken
                            actionTaken = true
                        } else {
                            await handleActionError(pauseError)
                            return
                        }
                    }
                } else {
                    // Player is not playing
                    if (player.paused) {
                        client.debug(
                            "[ControlButtonHandler] Player is paused. Attempting to resume."
                        )
                        try {
                            await player.resume()
                            client.debug("[ControlButtonHandler] Player resumed.")
                            actionTaken = true
                        } catch (resumeError: unknown) {
                            const re =
                                resumeError instanceof Error
                                    ? resumeError.message
                                    : String(resumeError)
                            if (re.includes("already paused")) {
                                client.warn(
                                    `[ControlButtonHandler] Caught '${re}' when trying to resume. Assuming already playing or command had no effect.`
                                )
                                // Consider the action taken even if this error occurs, as the intent was to resume
                                actionTaken = true
                            } else {
                                await handleActionError(resumeError)
                                return
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
                                const voiceChannel = member.voice?.channel
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
                            await startPlaybackIfNeeded(player)
                            client.debug("[ControlButtonHandler] Player started playing.")
                            actionTaken = true
                        } catch (playError) {
                            await handleActionError(playError)
                            return
                        }
                    }
                }
                break
            }
            case "control_stop": {
                try {
                    await player.destroy()
                    actionTaken = true
                    client.debug("[ControlButtonHandler] Player stopped")
                    try {
                        await interaction.followUp({ content: "BYE!", ephemeral: true })
                    } catch (followErr: unknown) {
                        client.error(
                            `[ControlButtonHandler] followUp failed after stop for ${customId}:`,
                            followErr
                        )
                    }
                } catch (destroyError: unknown) {
                    await handleActionError(destroyError)
                }
                break
            }
            case "control_skip": {
                if (!player.queue.current && player.queue.tracks.length === 0) {
                    client.warn(
                        "[ControlButtonHandler] Skip clicked but no current track and no queued tracks."
                    )
                    await interaction.followUp({
                        content: "Nothing is currently playing to skip.",
                        ephemeral: true,
                    })
                    break
                }

                try {
                    if (player.queue.tracks.length > 0) {
                        client.debug("[ControlButtonHandler] player.skip() (queued tracks exist).")
                        await player.skip()
                    } else {
                        client.debug(
                            "[ControlButtonHandler] player.skip(0, false) — only current track (e.g. autoplay)."
                        )
                        await player.skip(0, false)
                    }
                    actionTaken = true
                    try {
                        await interaction.followUp({ content: "Skipped.", ephemeral: true })
                    } catch (followErr: unknown) {
                        client.error(
                            `[ControlButtonHandler] followUp failed after skip for ${customId}:`,
                            followErr
                        )
                    }
                } catch (skipError: unknown) {
                    await handleActionError(skipError)
                    return
                }

                break
            }
            case "control_shuffle": {
                // Upcoming queue only; need at least two tracks to shuffle meaningfully
                if (!player.queue || player.queue.tracks.length < 2) {
                    client.debug(
                        "[ControlButtonHandler] Shuffle clicked but not enough upcoming tracks to shuffle."
                    )
                    await interaction.followUp({
                        content: "Not enough songs in the queue to shuffle.",
                        ephemeral: true,
                    })
                    break // Don't set actionTaken
                }
                try {
                    await player.queue.shuffle()
                    actionTaken = true
                    client.debug("[ControlButtonHandler] Queue shuffled.")
                    try {
                        await interaction.followUp({ content: "Queue shuffled.", ephemeral: true })
                    } catch (followErr: unknown) {
                        client.error(
                            `[ControlButtonHandler] followUp failed after shuffle for ${customId}:`,
                            followErr
                        )
                    }
                } catch (shuffleError: unknown) {
                    client.error("[ControlButtonHandler] Error shuffling queue:", shuffleError)
                    await interaction
                        .followUp({
                            content: "An error occurred while trying to shuffle.",
                            ephemeral: true,
                        })
                        .catch(() => {})
                }
                break
            }
            case "control_loop": {
                const current = player.repeatMode
                let newMode: "off" | "track" | "queue"
                let feedback = ""

                if (current === "off") {
                    newMode = "track"
                    feedback = "Track loop enabled."
                } else if (current === "track") {
                    newMode = "queue"
                    feedback = "Queue loop enabled."
                } else {
                    newMode = "off"
                    feedback = "Loop disabled."
                }

                try {
                    await player.setRepeatMode(newMode)
                    actionTaken = true
                    client.debug(`[ControlButtonHandler] Repeat mode set to ${newMode}.`)
                    try {
                        await interaction.followUp({ content: feedback, ephemeral: true })
                    } catch (followErr: unknown) {
                        client.error(
                            `[ControlButtonHandler] followUp failed after loop toggle for ${customId}:`,
                            followErr
                        )
                    }
                } catch (loopError: unknown) {
                    client.error("[ControlButtonHandler] Error setting loop mode:", loopError)
                    await interaction
                        .followUp({
                            content: "An error occurred while setting loop mode.",
                            ephemeral: true,
                        })
                        .catch(() => {})
                }
                break
            }
            case "control_autoplay": {
                const enabled = toggleAutoplay(player)
                actionTaken = true
                try {
                    await interaction.followUp({
                        content: enabled ? "Autoplay **enabled**." : "Autoplay **disabled**.",
                        ephemeral: true,
                    })
                } catch (followErr: unknown) {
                    client.error(
                        `[ControlButtonHandler] followUp failed after autoplay toggle for ${customId}:`,
                        followErr
                    )
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
            client.debug(
                `[ControlButtonHandler] Action ${customId} completed, updating control message.`
            )
            // No need to await this, let it run in the background
            updateControlMessage(client, guildId).catch((err: unknown) =>
                client.error(
                    `[ControlButtonHandler] Error updating control message after action ${customId}:`,
                    err
                )
            )
        } else {
            client.debug(
                `[ControlButtonHandler] No action taken for ${customId}, not updating message.`
            )
        }
    } catch (playerError: unknown) {
        await handleActionError(playerError)
    }
}
