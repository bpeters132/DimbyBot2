import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"

import { formatDuration } from "../../util/formatDuration.js"
import { getLivePlayerIfUnchanged } from "../../util/livePlayerIdentity.js"
import { ensurePlayerConnected } from "../../util/musicManager.js"
import { isStaleSessionDiscordError } from "../../util/restorePlayerSessions.js"
import { skipCurrentTrack } from "../../util/skipCurrentTrack.js"

export default {
    data: new SlashCommandBuilder()
        .setName("playerctl")
        .setDescription("Control or view Lavalink players in specific guilds (Developer Only)")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("view")
                .setDescription("View details of a player in a specific guild")
                .addStringOption((option) =>
                    option
                        .setName("guildid")
                        .setDescription("The ID of the guild to view the player for")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("skip")
                .setDescription("Force skip the current track for a player in a specific guild")
                .addStringOption((option) =>
                    option
                        .setName("guildid")
                        .setDescription("The ID of the guild to skip the track for")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("stop")
                .setDescription(
                    "Stop playback and clear the queue for a player in a specific guild"
                )
                .addStringOption((option) =>
                    option
                        .setName("guildid")
                        .setDescription("The ID of the guild to stop the player for")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("destroy")
                .setDescription("Destroy the player instance for a specific guild")
                .addStringOption((option) =>
                    option
                        .setName("guildid")
                        .setDescription("The ID of the guild to destroy the player for")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("reconnect")
                .setDescription("Rejoin the current voice channel without changing the queue")
                .addStringOption((option) =>
                    option
                        .setName("guildid")
                        .setDescription("The ID of the guild to reconnect the player for")
                        .setRequired(true)
                )
        ),
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        // --- Developer Check ---
        const ownerId = process.env.OWNER_ID
        if (!ownerId) {
            client.error(
                "[PlayerCtl] Developer ID is not configured as OWNER_ID in environment variables!"
            )
            return interaction.reply({
                content: "Command configuration error: Developer ID not set.",
                flags: [MessageFlags.Ephemeral],
            })
        }
        if (interaction.user.id !== ownerId) {
            client.debug(
                `[PlayerCtl] Denied access to user ${interaction.user.tag} (${interaction.user.id})`
            )
            return interaction.reply({
                content: "Sorry, this command can only be used by the bot developer.",
                flags: [MessageFlags.Ephemeral],
            })
        }
        // --- End Developer Check ---

        const subcommand = interaction.options.getSubcommand()
        const guildId = interaction.options.getString("guildid", true)
        const player = client.lavalink.players.get(guildId)

        client.debug(
            `[PlayerCtl] Developer ${interaction.user.tag} executing '${subcommand}' for guild ${guildId}`
        )

        if (!player) {
            return interaction.reply({
                content: `❌ No active player found for Guild ID: ${guildId}`,
                flags: [MessageFlags.Ephemeral],
            })
        }

        await interaction.deferReply({
            flags: [MessageFlags.Ephemeral],
        })

        // Mutating subcommands use guild-keyed Lavalink APIs; refuse if /stop+/play replaced
        // the player during deferReply (or a later await).
        const resolveLive = () =>
            getLivePlayerIfUnchanged(() => client.lavalink.players.get(guildId), player)

        try {
            switch (subcommand) {
                case "view": {
                    const viewPlayer = client.lavalink.players.get(guildId) ?? player
                    const guild = client.guilds.cache.get(guildId)
                    const track = viewPlayer.queue.current
                    const queueSize = viewPlayer.queue.tracks.length
                    const voiceCh =
                        viewPlayer.voiceChannelId != null
                            ? client.channels.cache.get(viewPlayer.voiceChannelId)
                            : undefined
                    const voiceName =
                        voiceCh &&
                        "name" in voiceCh &&
                        typeof (voiceCh as { name: string }).name === "string"
                            ? (voiceCh as { name: string }).name
                            : "Unknown Channel"

                    const embed = new EmbedBuilder()
                        .setColor(0x0099ff)
                        .setTitle(`Player Status: ${guild?.name ?? "Unknown Guild"} (${guildId})`)
                        .addFields(
                            {
                                name: "Connected",
                                value: viewPlayer.connected ? "Yes" : "No",
                                inline: true,
                            },
                            {
                                name: "Playing",
                                value: viewPlayer.playing ? "Yes" : "No",
                                inline: true,
                            },
                            {
                                name: "Volume",
                                value: viewPlayer.volume?.toString() || "N/A",
                                inline: true,
                            },
                            {
                                name: "Paused",
                                value: viewPlayer.paused ? "Yes" : "No",
                                inline: true,
                            },
                            { name: "Repeat", value: viewPlayer.repeatMode, inline: true },
                            { name: "Node", value: viewPlayer.node?.id || "N/A", inline: true },
                            {
                                name: "Voice Channel",
                                value: `${voiceName} (${viewPlayer.voiceChannelId ?? "N/A"})`,
                            },
                            { name: "Text Channel", value: viewPlayer.textChannelId || "N/A" },
                            { name: "Queue Size", value: queueSize.toString(), inline: true }
                        )
                        .setTimestamp()

                    if (track) {
                        const position = formatDuration(viewPlayer.position)
                        const duration = formatDuration(track.info.duration)
                        embed.addFields(
                            {
                                name: "Current Track",
                                value: `[${track.info.title}](${track.info.uri})`,
                            },
                            { name: "Position", value: `${position} / ${duration}`, inline: true },
                            {
                                name: "Requester",
                                value: (() => {
                                    const req = track.requester
                                    if (req == null) return "N/A"
                                    if (typeof req === "string") return `<@${req}>`
                                    if (
                                        typeof req === "object" &&
                                        "id" in req &&
                                        typeof (req as { id: unknown }).id === "string"
                                    ) {
                                        return `<@${(req as { id: string }).id}>`
                                    }
                                    return "N/A"
                                })(),
                                inline: true,
                            }
                        )
                    } else {
                        embed.addFields({ name: "Current Track", value: "Nothing playing" })
                    }

                    await interaction.editReply({ embeds: [embed] })
                    client.debug(`[PlayerCtl] Showed player view for guild ${guildId}`)
                    break
                }
                case "skip": {
                    const live = resolveLive()
                    if (!live) {
                        await interaction.editReply({
                            content: `❌ Player for Guild ID ${guildId} stopped or was replaced before skip finished.`,
                        })
                        return
                    }
                    if (!live.queue.current && live.queue.tracks.length === 0) {
                        await interaction.editReply({
                            content: "❌ Nothing is currently playing in that guild.",
                        })
                        return
                    }
                    const skipped = await skipCurrentTrack(live, undefined, resolveLive)
                    if (skipped === "stale") {
                        await interaction.editReply({
                            content: `❌ Player for Guild ID ${guildId} stopped or was replaced before skip finished.`,
                        })
                        return
                    }
                    if (skipped === "deferred") {
                        await interaction.editReply({
                            content: `❌ Could not skip in Guild ID ${guildId}; the next track is still preparing.`,
                        })
                        return
                    }
                    await interaction.editReply(`✅ Force-skipped track in Guild ID: ${guildId}`)
                    client.debug(`[PlayerCtl] Force-skipped track for guild ${guildId}`)
                    break
                }
                case "stop": {
                    const live = resolveLive()
                    if (!live) {
                        await interaction.editReply({
                            content: `❌ Player for Guild ID ${guildId} stopped or was replaced before stop finished.`,
                        })
                        return
                    }
                    await live.stopPlaying()
                    await interaction.editReply(
                        `✅ Stopped player and cleared queue in Guild ID: ${guildId}`
                    )
                    client.debug(`[PlayerCtl] Stopped player for guild ${guildId}`)
                    break
                }
                case "destroy": {
                    const live = resolveLive()
                    if (!live) {
                        await interaction.editReply({
                            content: `❌ Player for Guild ID ${guildId} stopped or was replaced before destroy finished.`,
                        })
                        return
                    }
                    await live.destroy()
                    await interaction.editReply(
                        `✅ Destroyed player instance for Guild ID: ${guildId}`
                    )
                    client.debug(`[PlayerCtl] Destroyed player for guild ${guildId}`)
                    break
                }
                case "reconnect": {
                    const live = resolveLive()
                    if (!live) {
                        await interaction.editReply({
                            content: `❌ Player for Guild ID ${guildId} stopped or was replaced before reconnect finished.`,
                        })
                        return
                    }
                    const voiceChannelId = live.voiceChannelId
                    if (!voiceChannelId) {
                        await interaction.editReply({
                            content: "❌ Player has no voice channel id; cannot reconnect.",
                        })
                        return
                    }
                    let fetched
                    try {
                        fetched = await client.channels.fetch(voiceChannelId)
                    } catch (err: unknown) {
                        if (isStaleSessionDiscordError(err)) {
                            await interaction.editReply({
                                content: `❌ Voice channel ${voiceChannelId} is missing or not voice-based.`,
                            })
                            return
                        }
                        throw err
                    }
                    if (!fetched || !fetched.isVoiceBased()) {
                        await interaction.editReply({
                            content: `❌ Voice channel ${voiceChannelId} is missing or not voice-based.`,
                        })
                        return
                    }
                    const liveAfterFetch = resolveLive()
                    if (!liveAfterFetch) {
                        await interaction.editReply({
                            content: `❌ Player for Guild ID ${guildId} stopped or was replaced before reconnect finished.`,
                        })
                        return
                    }
                    await ensurePlayerConnected(client, liveAfterFetch, fetched)
                    await interaction.editReply(
                        `✅ Rejoined voice channel for Guild ID: ${guildId} (queue unchanged).`
                    )
                    client.debug(`[PlayerCtl] Reconnected voice for guild ${guildId}`)
                    break
                }
            }
        } catch (error: unknown) {
            client.error(`[PlayerCtl] Error executing '${subcommand}' for guild ${guildId}:`, error)
            const msg = error instanceof Error ? error.message : String(error)
            await interaction.editReply(
                `❌ An error occurred while executing the command for Guild ID ${guildId}. Check console. Error: ${msg}`
            )
        }
    },
}
