import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    type GuildTextBasedChannel,
    type Message,
} from "discord.js"
import type { Player } from "lavalink-client"
import { setTimeout as sleep } from "node:timers/promises"
import type BotClient from "../../lib/BotClient.js"
import { getDiscordErrorCode } from "../../util/discordErrorDetails.js"
import { getGuildSettings, ensureStorageDir } from "../../util/saveControlChannel.js"

/**
 * Formats milliseconds into HH:MM:SS or MM:SS string.
 * @param {number} milliseconds Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
function formatDuration(milliseconds: number | null | undefined) {
    if (milliseconds === undefined || milliseconds === null) return "00:00"
    const seconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    const displaySeconds = String(seconds % 60).padStart(2, "0")
    const displayMinutes = String(minutes % 60).padStart(2, "0")

    if (hours > 0) {
        return `${hours}:${displayMinutes}:${displaySeconds}`
    }
    return `${displayMinutes}:${displaySeconds}`
}

/**
 * Creates the embed for the player control message.
 * @param {import("../../lib/BotClient").default} client The bot client instance for logging.
 * @param {import("lavalink-client").Player | null | undefined} player The Lavalink player (if any).
 * @returns {EmbedBuilder} The created embed.
 */
function requesterMention(req: unknown): string | null {
    if (req == null) return null
    if (typeof req === "string") return `<@${req}>`
    if (typeof req === "object" && "id" in req && typeof (req as { id: unknown }).id === "string") {
        return `<@${(req as { id: string }).id}>`
    }
    return null
}

export function createControlEmbed(client: BotClient, player: Player | null | undefined) {
    client.debug(
        `[ControlHandler] Creating control embed. Player state: ${player ? `Playing: ${player.playing}, Current: ${!!player.queue?.current}, Queue Size: ${player.queue?.tracks?.length ?? 0}` : "null"}`
    )
    const embed = new EmbedBuilder()
        .setColor(player && player.playing ? 0x00ff00 : 0xff0000)
        .setTitle("Player Controls")
        .setFooter({ text: "Send a song link or search query to add to the queue." })
        .setTimestamp()

    if (player && player.queue && player.queue.current) {
        const currentTrack = player.queue.current
        embed
            .setDescription(
                `**Now Playing:** [${currentTrack.info.title}](${currentTrack.info.uri})`
            )
            .addFields(
                {
                    name: "Duration",
                    value: currentTrack.info.isStream
                        ? "LIVE"
                        : `${formatDuration(currentTrack.info.duration ?? 0)}`,
                    inline: true,
                },
                { name: "Queue", value: `${player.queue.tracks.length} songs`, inline: true },
                { name: "Status", value: player.playing ? "Playing" : "Paused", inline: true },
                { name: "Loop", value: String(player.repeatMode).toUpperCase(), inline: true },
                {
                    name: "Autoplay",
                    value: player.get("autoplay") ? "On" : "Off",
                    inline: true,
                }
            )
        const reqMention = requesterMention(currentTrack.requester)
        if (reqMention) {
            embed.addFields({
                name: "Requested by",
                value: reqMention,
                inline: true,
            })
        }
        const thumb =
            currentTrack.info.artworkUrl ||
            (currentTrack.info.identifier && currentTrack.info.sourceName === "youtube"
                ? `https://img.youtube.com/vi/${currentTrack.info.identifier}/hqdefault.jpg`
                : null)
        if (thumb) {
            embed.setThumbnail(thumb)
        }
    } else {
        embed.setDescription("Nothing playing. Add a song!")
        embed.addFields(
            { name: "Queue", value: "Empty", inline: true },
            { name: "Status", value: "Idle", inline: true },
            { name: "Loop", value: "Off", inline: true },
            {
                name: "Autoplay",
                value: player?.get?.("autoplay") ? "On" : "Off",
                inline: true,
            }
        )
    }

    client.debug(
        `[ControlHandler] Control embed created. Description: ${embed.data.description?.substring(0, 50)}...`
    )
    return embed
}

/**
 * Creates action rows for the player control message (max 5 buttons per row; autoplay is on row 2).
 */
export function createControlButtons(
    client: BotClient,
    player: Player | null | undefined
): ActionRowBuilder<ButtonBuilder>[] {
    client.debug(
        `[ControlHandler] Creating control buttons. Player state: ${player ? `Playing: ${player.playing}, Current: ${!!player.queue?.current}, Queue Size: ${player.queue?.tracks?.length ?? 0}` : "null"}`
    )
    const isPlaying = player && player.playing
    const hasCurrent = player && player.queue && player.queue.current
    const hasQueue = player && player.queue && player.queue.tracks.length > 0

    const playPauseButton = new ButtonBuilder()
        .setCustomId("control_play_pause")
        .setLabel(isPlaying ? "Pause" : "Play")
        .setStyle(isPlaying ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(!hasCurrent)

    const stopButton = new ButtonBuilder()
        .setCustomId("control_stop")
        .setLabel("Stop")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!hasCurrent)

    const skipButton = new ButtonBuilder()
        .setCustomId("control_skip")
        .setLabel("Skip")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasCurrent)

    const shuffleButton = new ButtonBuilder()
        .setCustomId("control_shuffle")
        .setLabel("Shuffle")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasQueue)

    const loopButton = new ButtonBuilder()
        .setCustomId("control_loop")
        .setLabel("Loop")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasCurrent && !hasQueue)

    const mainRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        playPauseButton,
        stopButton,
        skipButton,
        shuffleButton,
        loopButton
    )

    const autoplayOn = Boolean(player?.get?.("autoplay"))
    const autoplayButton = new ButtonBuilder()
        .setCustomId("control_autoplay")
        .setLabel(autoplayOn ? "Autoplay: On" : "Autoplay: Off")
        .setStyle(autoplayOn ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!player)

    const autoplayRow = new ActionRowBuilder<ButtonBuilder>().addComponents(autoplayButton)

    const rows = [mainRow, autoplayRow]
    const labels = rows
        .flatMap((r) => r.components)
        .map((c) =>
            "data" in c && c.data && "label" in c.data
                ? String((c.data as { label?: string }).label ?? "")
                : "?"
        )
        .join(", ")
    client.debug(`[ControlHandler] Control buttons created. Button labels: ${labels}`)
    return rows
}

/**
 * Cleans up messages in the control channel, leaving only the main control message.
 * @param {import('discord.js').TextChannel} channel The control text channel.
 * @param {string} controlMessageId The ID of the message that should NOT be deleted.
 * @param {import('../lib/BotClient.js').default} client The bot client for logging.
 */
export async function cleanupControlChannel(
    channel: GuildTextBasedChannel,
    controlMessageId: string,
    client: BotClient
) {
    if (!channel) return
    client.debug(`[ControlCleanup] Starting cleanup for channel ${channel.id}`)

    const me = client.user
    if (!me) return
    const botPermissions = channel.permissionsFor(me)
    if (!botPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
        client.warn(
            `[ControlCleanup] Missing ManageMessages permission in channel ${channel.id}. Cannot cleanup.`
        )
        return
    }

    try {
        // Fetch recent messages (limit 15-20 is usually sufficient)
        const messages = await channel.messages.fetch({ limit: 15 })
        if (messages.size <= 1) {
            client.debug(
                `[ControlCleanup] No messages to clean (or only control message found) in channel ${channel.id}.`
            )
            return // Nothing to delete besides potentially the control message itself
        }

        // Filter out the main control message
        const messagesToDelete = messages.filter((msg: Message) => msg.id !== controlMessageId)

        if (messagesToDelete.size > 0) {
            client.debug(
                `[ControlCleanup] Found ${messagesToDelete.size} messages to delete in channel ${channel.id}.`
            )
            client.debug("[ControlCleanup] Waiting 5 seconds before deleting...")
            await sleep(5000)
            // Bulk delete messages. discord.js handles filtering out messages older than 14 days automatically.
            await channel.bulkDelete(messagesToDelete, true) // true ignores messages older than 14 days
            client.debug(
                `[ControlCleanup] Successfully deleted ${messagesToDelete.size} messages in channel ${channel.id}.`
            )
        } else {
            client.debug(
                `[ControlCleanup] No extraneous messages found to delete in channel ${channel.id}.`
            )
        }
    } catch (error: unknown) {
        // Ignore "Unknown Message" errors (10008) as they are expected if messages were deleted during the delay
        const code = getDiscordErrorCode(error)
        if (code === 10008) {
            client.warn(
                `[ControlCleanup] Encountered known issue (10008: Unknown Message) during cleanup for channel ${channel.id}. Likely due to race condition. Ignoring.`
            )
        } else {
            // Log other errors as actual errors
            client.error(
                `[ControlCleanup] Error during control channel cleanup for channel ${channel.id}:`,
                error
            )
        }
    }
}

/**
 * Updates the persistent control message for a guild and optionally cleans up the channel.
 * Fetches player state, channel, and message based on stored settings.
 * @param performCleanup When false, skips {@link cleanupControlChannel} (e.g. startup refresh should not bulk-delete).
 */
export async function updateControlMessage(
    client: BotClient,
    guildId: string,
    performCleanup = true
) {
    client.debug(`[ControlHandler] Attempting to update control message for guild ${guildId}`)

    let controlChannel: GuildTextBasedChannel | null = null

    try {
        const guildSettings = getGuildSettings()
        const settings = guildSettings[guildId]

        if (!settings || !settings.controlChannelId || !settings.controlMessageId) {
            client.debug(
                `[ControlHandler] No control channel/message configured for guild ${guildId}, skipping update.`
            )
            return
        }
        client.debug(
            `[ControlHandler] Found settings for guild ${guildId}: Channel ${settings.controlChannelId}, Message ${settings.controlMessageId}`
        )

        ensureStorageDir(client)
        const fetched = await client.channels.fetch(settings.controlChannelId).catch(() => null)
        if (!fetched || !fetched.isTextBased()) {
            client.warn(
                `[ControlHandler] Control channel ${settings.controlChannelId} not found or not text-based for guild ${guildId}. Cannot update message.`
            )
            return
        }
        controlChannel = fetched as GuildTextBasedChannel
        client.debug(
            `[ControlHandler] Fetched control channel ${controlChannel.id} for guild ${guildId}`
        )

        const controlMessage = await controlChannel.messages
            .fetch(settings.controlMessageId)
            .catch(() => null)
        if (!controlMessage) {
            client.warn(
                `[ControlHandler] Control message ${settings.controlMessageId} not found in channel ${controlChannel.id} for guild ${guildId}. Cannot update message.`
            )
            return
        }
        client.debug(
            `[ControlHandler] Fetched control message ${controlMessage.id} for guild ${guildId}`
        )

        const player = client.lavalink?.getPlayer(guildId)
        client.debug(
            `[ControlHandler] Fetched player state for guild ${guildId}: ${player ? "Exists" : "null"}`
        )

        const updatedEmbed = createControlEmbed(client, player)
        const updatedButtons = createControlButtons(client, player)

        await controlMessage.edit({ embeds: [updatedEmbed], components: updatedButtons })
        client.debug(
            `[ControlHandler] Successfully edited control message ${controlMessage.id} in guild ${guildId}`
        )

        if (performCleanup) {
            // Don't await cleanup; let it run in the background after a delay.
            cleanupControlChannel(controlChannel, controlMessage.id, client).catch(
                (err: unknown) => {
                    client.error(
                        `[ControlHandler] Background cleanup failed for channel ${controlChannel!.id}:`,
                        err
                    )
                }
            )
        }
    } catch (error: unknown) {
        const code = getDiscordErrorCode(error)
        if (code === 50001 || code === 10008 || code === 50013) {
            client.warn(
                `[ControlHandler] Failed to update control message for guild ${guildId} (Code: ${code}). Might be missing permissions or message/channel deleted.`
            )
        } else {
            client.error(
                `[ControlHandler] Failed to update control message for guild ${guildId}:`,
                error
            )
        }
    }
}

/**
 * Re-edits every guild control message so new buttons/layout apply without `/control-channel set`.
 * Called once after login; staggered to reduce rate limits.
 */
export async function refreshAllControlMessages(client: BotClient): Promise<void> {
    let store: ReturnType<typeof getGuildSettings>
    try {
        store = getGuildSettings()
    } catch (err: unknown) {
        client.error(
            "[ControlHandler] refreshAllControlMessages: getGuildSettings failed; skipping startup control refresh.",
            err
        )
        return
    }
    const guildIds = Object.keys(store).filter(
        (id) => store[id]?.controlChannelId && store[id]?.controlMessageId
    )
    client.info(`[ControlHandler] Refreshing ${guildIds.length} control message(s) after startup.`)
    for (const gid of guildIds) {
        await updateControlMessage(client, gid, false).catch((err: unknown) =>
            client.warn(`[ControlHandler] Startup refresh failed for guild ${gid}: ${err}`)
        )
        await sleep(400)
    }
}
