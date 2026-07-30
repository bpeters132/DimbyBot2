import {
    PermissionsBitField,
    MessageType,
    type GuildTextBasedChannel,
    type Message,
} from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import { discordDeleteErrorDetails } from "../../util/discordErrorDetails.js"
import {
    tryDestroyOrphanGuildPlayer,
    withGuildPlayerLifecycleReservation,
} from "../../util/guildPlayerQueueLock.js"
import { handleQueryAndPlay } from "../../util/musicManager.js"
import { destroyPlayerSuppressingSessionClear } from "../../util/playerSessionPersistence.js"
import { playerHasQueueContent } from "../../util/playlistQueue.js"
import {
    memberMayJoinOccupiedVoice,
    resolveOccupiedVoiceChannelId,
} from "../../util/sameVoiceChannel.js"

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
        client.debug(
            `[ControlHandler] Bot has Connect/Speak permissions for VC ${voiceChannel.id}.`
        )

        // 3. Refuse if bot occupies another VC (incl. local playback), then reserve + get/create.
        const guild = message.guild
        if (!guild) return
        {
            const existingPlayer = client.lavalink?.getPlayer(guildId)
            const occupiedVoiceChannelId = resolveOccupiedVoiceChannelId(guild, existingPlayer)
            if (!memberMayJoinOccupiedVoice(occupiedVoiceChannelId, voiceChannel.id)) {
                client.warn(
                    `[ControlHandler] User ${member.id} in VC ${voiceChannel.id}, but bot occupies VC ${occupiedVoiceChannelId} for guild ${guildId}.`
                )
                const otherVc = occupiedVoiceChannelId
                    ? client.channels.cache.get(occupiedVoiceChannelId)
                    : undefined
                const otherName =
                    otherVc &&
                    "name" in otherVc &&
                    typeof (otherVc as { name: string }).name === "string"
                        ? (otherVc as { name: string }).name
                        : "Unknown Channel"
                feedbackMessage = await sendChannel.send(
                    `${member}, I'm already playing in another voice channel (${otherName}).`
                )
                return
            }
        }

        const controlOutcome = await withGuildPlayerLifecycleReservation(guildId, async () => {
            let player = client.lavalink?.getPlayer(guildId)
            let createdHere = false
            if (!player) {
                client.debug(
                    `[ControlHandler] No existing player for guild ${guildId}. Creating one.`
                )
                player = client.lavalink?.createPlayer({
                    guildId,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: sendChannel.id,
                    selfDeaf: true,
                    volume: 100, // TODO: Make volume configurable?
                })
                createdHere = true
                client.debug(`[ControlHandler] Created Lavalink player for guild ${guildId}.`)
            } else {
                client.debug(
                    `[ControlHandler] Found existing player for guild ${guildId}. Connected: ${player.connected}`
                )
            }

            if (!player) {
                return { kind: "no_player" as const }
            }

            const cleanupCreatedPlayer = async (): Promise<void> => {
                if (!createdHere) return
                // Match web search/enqueue teardown: ephemeral destroy must not wipe a prior
                // persisted session still awaiting restore.
                await tryDestroyOrphanGuildPlayer(guildId, {
                    hasQueueContent: () => {
                        const live = client.lavalink?.getPlayer(guildId) ?? player
                        return live ? playerHasQueueContent(live) : false
                    },
                    destroyPlayer: async () => {
                        await destroyPlayerSuppressingSessionClear(guildId, () =>
                            client.lavalink?.destroyPlayer(guildId)
                        )
                    },
                })
            }

            if (!player.connected) {
                client.debug(
                    `[ControlHandler] Player not connected for guild ${guildId}. Attempting connection to VC ${voiceChannel.id}.`
                )
                player.voiceChannelId = voiceChannel.id
                player.textChannelId = sendChannel.id
                try {
                    await player.connect()
                    client.debug(
                        `[ControlHandler] Player successfully connected to VC ${voiceChannel.id} in guild ${guildId}.`
                    )
                } catch (connectError: unknown) {
                    client.error(
                        `[ControlHandler] Player failed to connect in guild ${guildId}:`,
                        connectError
                    )
                    await cleanupCreatedPlayer()
                    return { kind: "connect_failed" as const }
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
                    otherVc &&
                    "name" in otherVc &&
                    typeof (otherVc as { name: string }).name === "string"
                        ? (otherVc as { name: string }).name
                        : "Unknown Channel"
                return { kind: "wrong_channel" as const, otherName }
            }
            client.debug(
                `[ControlHandler] Player connected status checked/handled for guild ${guildId}.`
            )

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
            // Failed search after create previously left an empty orphan; alone-in-VC destroy
            // then cleared any prior persisted session. Tear down with suppress like web.
            if (!result.success) {
                await cleanupCreatedPlayer()
            }
            return { kind: "played" as const, result }
        })

        if (controlOutcome.kind === "no_player") {
            feedbackMessage = await sendChannel.send(
                `${member}, Could not start the music player. Try again in a moment.`
            )
            return
        }
        if (controlOutcome.kind === "connect_failed") {
            feedbackMessage = await sendChannel.send(
                `${member}, I couldn't connect to your voice channel.`
            )
            return
        }
        if (controlOutcome.kind === "wrong_channel") {
            feedbackMessage = await sendChannel.send(
                `${member}, I'm already playing in another voice channel (${controlOutcome.otherName}).`
            )
            return
        }

        client.debug(
            `[ControlHandler] handleQueryAndPlay result for guild ${guildId}: Success=${controlOutcome.result.success}, Feedback="${controlOutcome.result.feedbackText}"`
        )

        // Send feedback from the result
        if (controlOutcome.result.feedbackText) {
            feedbackMessage = await sendChannel.send(controlOutcome.result.feedbackText)
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
            const botPermissions = botUser ? sendChannel.permissionsFor(botUser) : null
            if (botPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
                await message.delete()
                client.debug(
                    `[ControlHandler] Deleted user query message ${message.id} in guild ${guildId}.`
                )
            } else {
                client.warn(
                    `[ControlHandler] Missing ManageMessages permission in control channel ${sendChannel.id} for guild ${guildId}, cannot delete query.`
                )
            }
        } catch (deleteError: unknown) {
            const { code, message: errMsg } = discordDeleteErrorDetails(deleteError)
            if (code === "10008") {
                client.debug(
                    `[ControlHandler] User query message ${message.id} already deleted or missing in guild ${guildId}.`
                )
            } else {
                client.warn(
                    `[ControlHandler] Failed to delete query message ${message.id} in guild ${guildId}: ${errMsg}`
                )
            }
        }

        // 10. Delete feedback message after a delay
        if (feedbackMessage) {
            const fm = feedbackMessage
            client.debug(
                `[ControlHandler] Scheduling deletion for feedback message ${fm.id} in guild ${guildId}.`
            )
            setTimeout(() => {
                void (async () => {
                    try {
                        await fm.delete()
                        client.debug(
                            `[ControlHandler] Deleted feedback message ${fm.id} in guild ${guildId}.`
                        )
                    } catch (feedbackDeleteError: unknown) {
                        const fe = feedbackDeleteError as { code?: number; message?: string }
                        if (fe.code !== 10008) {
                            client.warn(
                                `[ControlHandler] Failed to delete feedback message ${fm.id}: ${fe.message}`
                            )
                        }
                    }
                })()
            }, 5000)
        }
        client.debug(
            `[ControlHandler] Exiting finally block for message ${message.id} in guild ${guildId}.`
        )
    }
}
