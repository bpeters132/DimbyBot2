/**
 * @fileoverview This file sets up event listeners for the main Lavalink Manager.
 * It handles events related to player creation/destruction, track playback,
 * queue management, voice channel interactions, player state changes, and debugging.
 * @see https://tomato6966.github.io/lavalink-client/api/types/manager/interfaces/lavalinkmanagerevents/
 */

import type { Message, MessageCreateOptions, MessagePayload } from "discord.js"
import type {
    Player,
    Track,
    TrackEndEvent,
    TrackExceptionEvent,
    TrackStuckEvent,
    UnresolvedTrack,
} from "lavalink-client"
import type BotClient from "../lib/BotClient.js"
import { getGuildSettings } from "../util/saveControlChannel.js"
import { rememberAutoplayPlayed } from "../util/autoplayHistory.js"
import { updateControlMessage } from "./handlers/handleControlChannel.js"
import { discordDeleteErrorDetails } from "../util/discordErrorDetails.js"
import {
    clearDisconnectedUser,
    hasTrackedDisconnect,
    isDisconnectTimeoutCurrent,
    isRRQActive,
    removeAndRebalanceRrqAfterDisconnect,
    trackDisconnectedUser,
    userHasQueuedTracks,
} from "../util/rrqDisconnect.js"

type GuildTextSendable = {
    send: (content: string | MessagePayload | MessageCreateOptions) => Promise<Message<boolean>>
}

function isTextSendable(channel: unknown): channel is GuildTextSendable {
    return (
        typeof channel === "object" &&
        channel !== null &&
        "send" in channel &&
        typeof (channel as { send?: unknown }).send === "function"
    )
}

function escapeDiscordMarkdown(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/\*/g, "\\*")
        .replace(/_/g, "\\_")
        .replace(/`/g, "\\`")
}

/** Guild nickname if cached/fetchable, else global/username — plain text, no @ mention. */
async function displayNameForRRQMessage(
    client: BotClient,
    guildId: string,
    userId: string
): Promise<string> {
    const guild =
        client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null))
    if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null)
        if (member) return escapeDiscordMarkdown(member.displayName)
    }
    const user = await client.users.fetch(userId).catch(() => null)
    if (user) return escapeDiscordMarkdown(user.globalName ?? user.username)
    return "someone"
}

export default async (client: BotClient) => {
    client.lavalink
        /**
         * Player Lifecycle Events
         */
        .on("playerCreate", (player: Player) => {
            client.debug(`[LavaMgrEvents] Player created for Guild: ${player.guildId}`)
        })
        .on("playerDestroy", (player: Player, reason: unknown) => {
            client.debug(
                `[LavaMgrEvents] Player destroyed for Guild: ${player.guildId}, Reason: ${reason}`
            )
            updateControlMessage(client, player.guildId)
        })
        .on("playerDisconnect", (player: Player, oldChannelId: string | null) => {
            client.debug(
                `[LavaMgrEvents] Player disconnected from Guild: ${player.guildId}, Old Channel: ${oldChannelId}`
            )
            updateControlMessage(client, player.guildId)
        })
        .on(
            "playerMove",
            (player: Player, oldChannelId: string | null, newChannelId: string | null) => {
                client.debug(
                    `[LavaMgrEvents] Player moved in Guild: ${player.guildId}, Old: ${oldChannelId}, New: ${newChannelId}`
                )
                // updateControlMessage(client, player.guildId) // Optional update
            }
        )

        /**
         * Track Playback Events
         */
        .on("trackStart", (player: Player, track: Track | null) => {
            if (!track?.info) return
            client.debug(
                `[LavaMgrEvents] Track started in Guild: ${player.guildId}, Title: ${track.info.title}`
            )
            updateControlMessage(client, player.guildId)

            const prev = player.queue.previous?.[0]
            const prevAuthor = prev?.info?.author?.trim()
            const prevTitle = prev?.info?.title?.trim()
            const previousInsufficient = !prevTitle || !prevAuthor || /^unknown$/i.test(prevAuthor)
            if (previousInsufficient && track?.info?.title) {
                player.set("lastTrack", {
                    artist: track.info.author?.trim() || "Unknown Artist",
                    title: track.info.title.trim(),
                })
            }

            if (track?.info) {
                rememberAutoplayPlayed(player, track.info)
            }

            const textId = player.textChannelId
            const channel = textId ? client.channels.cache.get(textId) : undefined
            const currentGuildSettings = getGuildSettings()
            const controlChannelId = currentGuildSettings[player.guildId]?.controlChannelId
            if (channel && textId !== controlChannelId && isTextSendable(channel)) {
                client.debug(
                    `[LavaMgrEvents] Sending trackStart message to non-control channel ${player.textChannelId} in guild ${player.guildId}.`
                )
                channel
                    .send(`Now playing: **${track.info.title}**`)
                    .then((msg: Message) => {
                        setTimeout(() => {
                            msg.delete().catch((e: unknown) => {
                                client.error(
                                    "[LavaMgrEvents] Failed to delete trackStart message (attempt 1):",
                                    e
                                )
                                const err = discordDeleteErrorDetails(e)
                                if (
                                    err.code === "EAI_AGAIN" ||
                                    err.message.includes("ECONNRESET")
                                ) {
                                    setTimeout(() => {
                                        msg.delete().catch((e2: unknown) =>
                                            client.error(
                                                "[LavaMgrEvents] Failed to delete trackStart message (attempt 2):",
                                                e2
                                            )
                                        )
                                    }, 2000)
                                }
                            })
                        }, 1000 * 10)
                    })
                    .catch((e: unknown) =>
                        client.error("[LavaMgrEvents] Failed to send trackStart message:", e)
                    )
            } else {
                client.debug(
                    `[LavaMgrEvents] Not sending trackStart message for guild ${player.guildId} (channel ${player.textChannelId}, control ${controlChannelId}).`
                )
            }
        })
        .on("trackEnd", (player: Player, track: Track | null, payload: TrackEndEvent) => {
            client.debug(
                `[LavaMgrEvents] Track ended in Guild: ${player.guildId}, Track: ${track?.info?.title ?? "N/A"}, Reason: ${payload.reason}`
            )
            updateControlMessage(client, player.guildId)
        })
        .on("trackStuck", async (player: Player, track: Track | null, payload: TrackStuckEvent) => {
            client.warn(
                `[LavaMgrEvents] Track stuck in Guild: ${player.guildId}, Track: ${track?.info?.title ?? "N/A"}, Threshold: ${payload.thresholdMs}`
            )
            updateControlMessage(client, player.guildId)

            const textIdStuck = player.textChannelId
            const channelStuck = textIdStuck ? client.channels.cache.get(textIdStuck) : undefined
            const currentGuildSettingsStuck = getGuildSettings()
            const controlChannelIdStuck =
                currentGuildSettingsStuck[player.guildId]?.controlChannelId
            if (
                channelStuck &&
                textIdStuck !== controlChannelIdStuck &&
                track &&
                isTextSendable(channelStuck)
            ) {
                client.debug(
                    `[LavaMgrEvents] Sending trackStuck message to non-control channel ${textIdStuck} in guild ${player.guildId}.`
                )
                channelStuck
                    .send(`Track stuck: **${track.info.title}**`)
                    .catch((e: unknown) =>
                        client.error("[LavaMgrEvents] Failed to send trackStuck message:", e)
                    )
            }
            client.debug(
                `[LavaMgrEvents] Attempting to skip stuck track in guild ${player.guildId}.`
            )
            await player.skip()
        })
        .on(
            "trackError",
            async (
                player: Player,
                track: Track | UnresolvedTrack | null,
                payload: TrackExceptionEvent
            ) => {
                client.error(
                    `[LavaMgrEvents] Track error in Guild: ${player.guildId}, Track: ${track?.info?.title ?? "Unknown Track"}`,
                    payload
                )
                updateControlMessage(client, player.guildId)

                const textIdErr = player.textChannelId
                const channelErr = textIdErr ? client.channels.cache.get(textIdErr) : undefined
                const currentGuildSettingsErr = getGuildSettings()
                const controlChannelIdErr =
                    currentGuildSettingsErr[player.guildId]?.controlChannelId
                const tInfo = track?.info
                if (
                    channelErr &&
                    textIdErr !== controlChannelIdErr &&
                    tInfo &&
                    isTextSendable(channelErr)
                ) {
                    client.debug(
                        `[LavaMgrEvents] Sending trackError message to non-control channel ${textIdErr} in guild ${player.guildId}.`
                    )

                    let errorMessage = `Error playing **${tInfo.title ?? "the track"}**\n\n`

                    if (
                        payload.exception?.cause?.includes("No supported audio streams available")
                    ) {
                        errorMessage += "**Possible reasons:**\n"
                        errorMessage += "• Video is age-restricted\n"
                        errorMessage += "• Video is region-locked\n"
                        errorMessage += "• Video has been removed or made private\n"
                        errorMessage += "• Video's audio format is not supported\n\n"
                        errorMessage += "**Track info:**\n"
                        errorMessage += `• Title: ${tInfo.title}\n`
                        errorMessage += `• Source: ${tInfo.sourceName}\n`
                        errorMessage += `• URI: ${tInfo.uri}\n\n`

                        if (tInfo.sourceName === "youtube") {
                            errorMessage += "**Alternative options:**\n"
                            errorMessage +=
                                "• Use `/download` command to download and play this video locally\n"
                            errorMessage += "• Try a different source for this track\n\n"
                        } else {
                            errorMessage += "**Alternative options:**\n"
                            errorMessage +=
                                "• Check if this track is available in the local downloads using `/play`\n"
                            errorMessage += "• Try a different source for this track\n\n"
                        }

                        if (player.queue.tracks.length > 0) {
                            errorMessage += "Skipping to next track in queue..."
                        } else {
                            errorMessage += "No more tracks in queue."
                        }
                    } else {
                        // Generic error handling
                        errorMessage += `**Error details:**\n`
                        errorMessage += `• Message: ${payload.exception?.message || "Unknown error"}\n`
                        if (payload.exception?.cause) {
                            errorMessage += `• Cause: ${payload.exception.cause}\n`
                        }
                        errorMessage += `\n**Track info:**\n`
                        errorMessage += `• Title: ${tInfo.title}\n`
                        errorMessage += `• Source: ${tInfo.sourceName}\n`
                        errorMessage += `• URI: ${tInfo.uri}`
                    }

                    channelErr
                        .send(errorMessage)
                        .catch((e: unknown) =>
                            client.error("[LavaMgrEvents] Failed to send trackError message:", e)
                        )
                }

                client.debug(
                    `[LavaMgrEvents] Attempting to skip track after error in guild ${player.guildId}.`
                )
                if (player.queue.tracks.length > 0) {
                    await player.skip()
                } else {
                    client.debug(
                        `[LavaMgrEvents] Queue is empty, not skipping after error in guild ${player.guildId}.`
                    )
                    await player.destroy()
                }
            }
        )

        /**
         * Queue Events
         */
        .on("queueEnd", (player: Player) => {
            client.debug(`[LavaMgrEvents] Queue ended for Guild: ${player.guildId}`)
            updateControlMessage(client, player.guildId) // Update control message immediately

            // Send message to non-control channel
            const textIdQ = player.textChannelId
            const channelQ = textIdQ ? client.channels.cache.get(textIdQ) : undefined
            const currentGuildSettingsQ = getGuildSettings()
            const controlChannelIdQ = currentGuildSettingsQ[player.guildId]?.controlChannelId
            if (channelQ && textIdQ !== controlChannelIdQ && isTextSendable(channelQ)) {
                client.debug(
                    `[LavaMgrEvents] Sending queueEnd message to non-control channel ${textIdQ} in guild ${player.guildId}.`
                )
                channelQ
                    .send("Queue has ended.")
                    .catch((e: unknown) =>
                        client.error("[LavaMgrEvents] Failed to send queueEnd message:", e)
                    )
            }

            // Standard player destroy timeout
            client.debug(
                `[LavaMgrEvents] Setting standard timeout to destroy player ${player.guildId} after queue end.`
            )
            setTimeout(() => {
                void (async () => {
                    client.debug(
                        `[LavaMgrEvents] Executing standard queue end timeout check for player ${player.guildId}.`
                    )
                    if (player && player.queue.tracks.length === 0 && !player.queue.current) {
                        client.debug(
                            `[LavaMgrEvents] Player ${player.guildId} is idle, destroying after queue end timeout.`
                        )
                        await player.destroy()
                    } else {
                        client.debug(
                            `[LavaMgrEvents] Player ${player.guildId} has new tracks or state changed, not destroying after standard timeout. Player: ${!!player}, Queue Size: ${player?.queue.tracks.length}, Current: ${!!player?.queue.current}`
                        )
                    }
                })()
            }, 5000)
        })

        /**
         * Voice Channel User Events
         */
        .on("playerVoiceJoin", (player: Player, userId: string) => {
            client.debug(
                `[LavaMgrEvents] User joined player's channel: Guild ${player.guildId}, User: ${userId}`
            )
            if (hasTrackedDisconnect(player, userId)) {
                clearDisconnectedUser(player, userId)
                client.debug(
                    `[LavaMgrEvents] User ${userId} rejoined VC in guild ${player.guildId}; RRQ queue removal cancelled.`
                )
            }
        })
        .on("playerVoiceLeave", (player: Player, userId: string) => {
            client.debug(
                `[LavaMgrEvents] User left player's channel: Guild ${player.guildId}, User: ${userId}`
            )
            const voiceChannel = player.voiceChannelId
                ? client.channels.cache.get(player.voiceChannelId)
                : undefined
            if (voiceChannel) {
                client.debug(
                    `[LavaMgrEvents] Setting timeout to check if bot is alone in VC ${player.voiceChannelId} for guild ${player.guildId}.`
                )
                setTimeout(async () => {
                    client.debug(
                        `[LavaMgrEvents] Executing check if bot is alone for player ${player.guildId}.`
                    )
                    try {
                        const vcId = player.voiceChannelId
                        if (!vcId) return
                        const updatedVoiceChannel = await client.channels
                            .fetch(vcId)
                            .catch(() => null)
                        if (updatedVoiceChannel && updatedVoiceChannel.isVoiceBased()) {
                            const humanMembers = updatedVoiceChannel.members.filter(
                                (m) => !m.user.bot
                            )
                            client.debug(
                                `[LavaMgrEvents] Current human member count in VC ${player.voiceChannelId}: ${humanMembers.size}`
                            ) // Log count
                            if (humanMembers.size === 0) {
                                client.info(
                                    `[LavaMgrEvents] Destroying player in Guild ${player.guildId} as bot is alone.`
                                )
                                await updateControlMessage(client, player.guildId) // Update before destroy
                                await player.destroy()
                            }
                        } else {
                            client.warn(
                                `[LavaMgrEvents] Could not verify member count for player ${player.guildId}. Channel ${player.voiceChannelId} not found or not voice-based.`
                            )
                        }
                    } catch (error: unknown) {
                        client.error(
                            `[LavaMgrEvents] Error checking channel members for player ${player.guildId}:`,
                            error
                        )
                    }
                }, 5000)
            }

            if (isRRQActive(player) && userHasQueuedTracks(player, userId)) {
                const guildId = player.guildId
                const timeoutHandle = setTimeout(() => {
                    void (async () => {
                        const p = client.lavalink.getPlayer(guildId)
                        if (!p) return
                        if (!isRRQActive(p)) {
                            clearDisconnectedUser(p, userId)
                            return
                        }
                        if (!isDisconnectTimeoutCurrent(p, userId, timeoutHandle)) return

                        const removedCount = await removeAndRebalanceRrqAfterDisconnect(p, userId, {
                            onRemoveError: (err: unknown) =>
                                client.error(
                                    "[LavaMgrEvents] RRQ removeUserTracksFromQueue failed:",
                                    err
                                ),
                            onRebalanceError: (rebalErr: unknown) =>
                                client.warn(
                                    "[LavaMgrEvents] RRQ rebalance after disconnect cleanup failed:",
                                    rebalErr
                                ),
                        })

                        if (removedCount > 0) {
                            try {
                                await updateControlMessage(client, p.guildId)
                            } catch (ctrlErr: unknown) {
                                const msg =
                                    ctrlErr instanceof Error ? ctrlErr.message : String(ctrlErr)
                                client.warn(
                                    `[LavaMgrEvents] updateControlMessage after RRQ cleanup failed: ${msg}`
                                )
                            }

                            const textIdRrq = p.textChannelId
                            const channelRrq = textIdRrq
                                ? client.channels.cache.get(textIdRrq)
                                : undefined
                            const currentGuildSettingsRrq = getGuildSettings()
                            const controlChannelIdRrq =
                                currentGuildSettingsRrq[p.guildId]?.controlChannelId
                            if (
                                channelRrq &&
                                textIdRrq !== controlChannelIdRrq &&
                                isTextSendable(channelRrq)
                            ) {
                                client.debug(
                                    `[LavaMgrEvents] Sending RRQ disconnect cleanup to non-control channel ${textIdRrq} in guild ${p.guildId}.`
                                )
                                const who = await displayNameForRRQMessage(
                                    client,
                                    p.guildId,
                                    userId
                                )
                                channelRrq
                                    .send({
                                        content: `Removed **${removedCount}** track(s) queued by ${who} (left voice channel).`,
                                        allowedMentions: { parse: [] },
                                    })
                                    .catch((e: unknown) =>
                                        client.error(
                                            "[LavaMgrEvents] Failed to send RRQ cleanup message:",
                                            e
                                        )
                                    )
                            }
                        }
                    })()
                }, 60_000)
                trackDisconnectedUser(player, userId, timeoutHandle)
            }
        })

        /**
         * Player State Change Events
         */
        .on("playerSocketClosed", (player: Player, payload: unknown) => {
            client.warn(
                `[LavaMgrEvents] Player WebSocket closed for Guild: ${player.guildId}`,
                payload
            )
            updateControlMessage(client, player.guildId)
        })
        .on("playerSuppressChange", (player: Player, suppress: boolean) => {
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
        .on("debug", (eventKey: string) => {
            client.debug(`[LavaMgrEvents] Lavalink Manager Internal Debug: ${eventKey}`)
        })
}