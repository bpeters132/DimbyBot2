import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
} from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"
import { formatDuration } from "../../util/formatDuration.js"
import {
    addTracksToPlaylist,
    createPlaylist,
    deletePlaylist,
    getPlaylist,
    getUserPlaylists,
    removeTrackFromPlaylistById,
} from "../../repositories/playlistRepository.js"
import {
    enqueueResolvedPlaylistTracks,
    pickPlayerForPlaylistSearch,
    resolveStoredPlaylistTracks,
    searchTracksForPlaylist,
} from "../../util/playlistQueue.js"
import { thumbnailFromLavalinkTrack } from "../../util/trackThumbnail.js"

export default {
    data: new SlashCommandBuilder()
        .setName("playlist")
        .setDescription("Manage your personal playlists")
        .addSubcommand((sub) =>
            sub
                .setName("create")
                .setDescription("Create a new playlist")
                .addStringOption((opt) =>
                    opt.setName("name").setDescription("Playlist name").setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("delete")
                .setDescription("Delete a playlist")
                .addStringOption((opt) =>
                    opt.setName("name").setDescription("Playlist name").setRequired(true)
                )
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("List your playlists"))
        .addSubcommand((sub) =>
            sub
                .setName("view")
                .setDescription("View tracks in a playlist")
                .addStringOption((opt) =>
                    opt.setName("name").setDescription("Playlist name").setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("add")
                .setDescription("Add a track to a playlist")
                .addStringOption((opt) =>
                    opt.setName("name").setDescription("Playlist name").setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("query")
                        .setDescription("Song to search for (defaults to now playing)")
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("remove")
                .setDescription("Remove a track from a playlist")
                .addStringOption((opt) =>
                    opt.setName("name").setDescription("Playlist name").setRequired(true)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName("index")
                        .setDescription("Track index (1-based)")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("play")
                .setDescription("Queue all tracks from a playlist")
                .addStringOption((opt) =>
                    opt.setName("name").setDescription("Playlist name").setRequired(true)
                )
                .addBooleanOption((opt) =>
                    opt.setName("shuffle").setDescription("Shuffle before queuing").setRequired(false)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const guild = interaction.guild
        if (!guild) {
            return interaction.reply({
                content: "Use this command in a server.",
                ephemeral: true,
            })
        }
        const member = guildMemberFromInteraction(interaction)
        if (!member) {
            return interaction.reply({
                content: "Could not resolve your member profile. Try again.",
                ephemeral: true,
            })
        }

        const userId = interaction.user.id
        const subcommand = interaction.options.getSubcommand()

        try {
        if (subcommand === "create") {
            const name = interaction.options.getString("name", true)
            const existing = await getPlaylist(userId, name)
            if (existing) {
                return interaction.reply({
                    content: `You already have a playlist named **${name}**.`,
                    ephemeral: true,
                })
            }
            await createPlaylist(userId, name)
            return interaction.reply({
                content: `Created playlist **${name}**.`,
                ephemeral: true,
            })
        }

        if (subcommand === "delete") {
            const name = interaction.options.getString("name", true)
            const existing = await getPlaylist(userId, name)
            if (!existing) {
                return interaction.reply({
                    content: `No playlist named **${name}** found.`,
                    ephemeral: true,
                })
            }
            await deletePlaylist(userId, name)
            return interaction.reply({
                content: `Deleted playlist **${name}**.`,
                ephemeral: true,
            })
        }

        if (subcommand === "list") {
            const playlists = await getUserPlaylists(userId)
            if (playlists.length === 0) {
                return interaction.reply({
                    content:
                        "You don't have any playlists yet. Use `/playlist create` to make one!",
                    ephemeral: true,
                })
            }
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle("Your Playlists")
                .setDescription(
                    playlists
                        .map(
                            (p) =>
                                `**${p.name}** — ${p.trackCount} track${p.trackCount === 1 ? "" : "s"}`
                        )
                        .join("\n")
                )
                .setTimestamp()
            return interaction.reply({ embeds: [embed], ephemeral: true })
        }

        if (subcommand === "view") {
            const name = interaction.options.getString("name", true)
            const playlist = await getPlaylist(userId, name)
            if (!playlist) {
                return interaction.reply({
                    content: `No playlist named **${name}** found.`,
                    ephemeral: true,
                })
            }
            return showPaginatedPlaylistView(interaction, client, playlist.name, playlist.tracks)
        }

        if (subcommand === "add") {
            const name = interaction.options.getString("name", true)
            const query = interaction.options.getString("query")
            const playlist = await getPlaylist(userId, name)
            if (!playlist) {
                return interaction.reply({
                    content: `No playlist named **${name}** found.`,
                    ephemeral: true,
                })
            }

            if (query) {
                await interaction.deferReply({ ephemeral: true })
                const player = pickPlayerForPlaylistSearch(client.lavalink, guild.id)
                if (!player) {
                    return interaction.editReply({
                        content:
                            "The bot is not in a voice channel anywhere. Join voice in a server with the bot, or try again later.",
                    })
                }
                const found = await searchTracksForPlaylist(player, query, interaction.user)
                if (found.ok === false) {
                    return interaction.editReply({ content: found.error })
                }
                const addedAt = new Date()
                const added = await addTracksToPlaylist(
                    playlist.id,
                    found.tracks.map((t) => ({
                        title: t.title,
                        uri: t.uri,
                        author: t.author,
                        duration: t.duration,
                        thumbnailUrl: t.thumbnailUrl,
                        addedAt,
                    }))
                )
                if (added.length === 1) {
                    const t = added[0]!
                    return interaction.editReply({
                        content: `Added **[${t.title}](${t.uri})** to **${name}**.`,
                    })
                }
                return interaction.editReply({
                    content: `Added **${added.length}** tracks to **${name}**.`,
                })
            }

            const player = client.lavalink.players.get(guild.id)
            const current = player?.queue.current
            if (!current) {
                return interaction.reply({
                    content: "Nothing is playing. Provide a `query` or start playback first.",
                    ephemeral: true,
                })
            }
            const info = current.info
            const uri = typeof info.uri === "string" ? info.uri.trim() : ""
            if (!uri) {
                return interaction.reply({
                    content: "The current track has no URL and cannot be saved to a playlist.",
                    ephemeral: true,
                })
            }
            await addTracksToPlaylist(playlist.id, [
                {
                    title: info.title ?? "Unknown",
                    uri,
                    author: info.author ?? "Unknown",
                    duration: info.duration ?? 0,
                    thumbnailUrl: thumbnailFromLavalinkTrack(current),
                    addedAt: new Date(),
                },
            ])
            return interaction.reply({
                content: `Added **[${info.title}](${uri})** to **${name}**.`,
                ephemeral: true,
            })
        }

        if (subcommand === "remove") {
            const name = interaction.options.getString("name", true)
            const index = interaction.options.getInteger("index", true)
            const playlist = await getPlaylist(userId, name)
            if (!playlist) {
                return interaction.reply({
                    content: `No playlist named **${name}** found.`,
                    ephemeral: true,
                })
            }
            if (index < 1 || index > playlist.tracks.length) {
                return interaction.reply({
                    content: `Invalid index. Choose between 1 and ${playlist.tracks.length}.`,
                    ephemeral: true,
                })
            }
            const track = playlist.tracks[index - 1]!
            await removeTrackFromPlaylistById(playlist.id, track.id)
            return interaction.reply({
                content: `Removed **${track.title}** from **${name}**.`,
                ephemeral: true,
            })
        }

        if (subcommand === "play") {
            const name = interaction.options.getString("name", true)
            const shuffle = interaction.options.getBoolean("shuffle") ?? false

            const voiceChannel = member.voice.channel
            if (!voiceChannel) {
                return interaction.reply({
                    content: "Join a voice channel first!",
                    ephemeral: true,
                })
            }

            await interaction.deferReply({ ephemeral: true })

            const playlist = await getPlaylist(userId, name)
            if (!playlist) {
                return interaction.editReply({
                    content: `No playlist named **${name}** found.`,
                })
            }
            if (playlist.tracks.length === 0) {
                return interaction.editReply({
                    content: `**${name}** has no tracks.`,
                })
            }

            let player = client.lavalink.getPlayer(guild.id)
            if (!player) {
                player = await client.lavalink.createPlayer({
                    guildId: guild.id,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: interaction.channelId,
                    selfDeaf: true,
                    volume: 100,
                })
            }

            if (player.connected && player.voiceChannelId !== voiceChannel.id) {
                return interaction.editReply({
                    content: "You need to be in the same voice channel as the bot!",
                })
            }

            const { resolved, failed } = await resolveStoredPlaylistTracks(
                player,
                playlist.tracks,
                interaction.user
            )

            if (resolved.length === 0) {
                return interaction.editReply({
                    content: `Could not resolve any tracks from **${name}**.`,
                })
            }

            const enqueue = await enqueueResolvedPlaylistTracks(
                player,
                resolved,
                interaction.user.id,
                shuffle
            )

            const failPart =
                failed > 0 ? ` ${failed} track${failed === 1 ? "" : "s"} could not be resolved.` : ""
            return interaction.editReply({
                content: `Queued ${enqueue.queued} track${enqueue.queued === 1 ? "" : "s"} from **${name}**.${failPart}`,
            })
        }

        return interaction.reply({ content: "Unknown subcommand.", ephemeral: true })
        } catch (err: unknown) {
            console.error("[Playlist command] execute failed", err)
            const content = "An error occurred while processing your request."
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({ content })
            }
            return interaction.reply({ content, ephemeral: true })
        }
    },
}

async function showPaginatedPlaylistView(
    interaction: ChatInputCommandInteraction,
    client: BotClient,
    playlistName: string,
    tracks: Array<{
        title: string
        uri: string
        duration: number
        position: number
    }>
): Promise<unknown> {
    const itemsPerPage = 10
    const totalPages = Math.ceil(tracks.length / itemsPerPage) || 1
    let currentPage = 1

    const totalDurationMs = tracks.reduce((acc, t) => acc + t.duration, 0)
    const totalDuration = formatDuration(totalDurationMs)

    const generateEmbed = (page: number) => {
        const start = (page - 1) * itemsPerPage
        const end = start + itemsPerPage
        const pageTracks = tracks.slice(start, end)

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle(`Playlist: ${playlistName}`)
            .setDescription(`**Total Duration:** \`${totalDuration}\``)
            .setTimestamp()
            .setFooter({ text: `Page ${page}/${totalPages}` })

        if (pageTracks.length > 0) {
            let fieldValue = pageTracks
                .map(
                    (track, i) =>
                        `**${start + i + 1}.** [${track.title}](${track.uri}) - \`${formatDuration(track.duration)}\``
                )
                .join("\n")
            if (fieldValue.length > 1024) {
                fieldValue = fieldValue.substring(0, 1021) + "..."
            }
            embed.addFields([{ name: "Tracks", value: fieldValue }])
        } else {
            embed.addFields([{ name: "Tracks", value: "_This playlist is empty._" }])
        }

        return embed
    }

    const generateButtons = (page: number) =>
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("prev_page")
                .setLabel("Previous")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 1),
            new ButtonBuilder()
                .setCustomId("next_page")
                .setLabel("Next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === totalPages)
        )

    const message = await interaction.reply({
        embeds: [generateEmbed(currentPage)],
        components: totalPages > 1 ? [generateButtons(currentPage)] : [],
        fetchReply: true,
        ephemeral: true,
    })

    if (totalPages <= 1) {
        return message
    }

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000,
        filter: (i: ButtonInteraction) => i.user.id === interaction.user.id,
    })

    collector.on("collect", async (i) => {
        try {
            await i.deferUpdate()
            if (i.customId === "prev_page") currentPage--
            else if (i.customId === "next_page") currentPage++
            await interaction.editReply({
                embeds: [generateEmbed(currentPage)],
                components: [generateButtons(currentPage)],
            })
        } catch (error: unknown) {
            client.error("Playlist view: pagination failed:", error)
        }
    })

    collector.on("end", async (_collected, reason) => {
        if (reason === "time") {
            try {
                await interaction.editReply({
                    embeds: [generateEmbed(currentPage)],
                    components: [
                        new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder()
                                .setCustomId("prev_page")
                                .setLabel("Previous")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true),
                            new ButtonBuilder()
                                .setCustomId("next_page")
                                .setLabel("Next")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true)
                        ),
                    ],
                })
            } catch (error: unknown) {
                client.error("Playlist view: failed to disable buttons:", error)
            }
        }
    })

    return message
}
