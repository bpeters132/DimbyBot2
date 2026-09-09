import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"
import { enqueuePlayNextTrackAssumingSearchDone } from "../../util/playNextEnqueue.js"
import { withGuildPlayerLifecycleReservation } from "../../util/guildPlayerQueueLock.js"
import { isBlockedUserMediaUrl, USER_MEDIA_URL_BLOCKED } from "../../util/userMediaUrl.js"
import { isSameLivePlayer } from "../../util/livePlayerIdentity.js"

export default {
    data: new SlashCommandBuilder()
        .setName("playnext")
        .setDescription("Queries and places a song at the top of the queue")
        .addStringOption((option) =>
            option.setName("query").setDescription("The song name or URL").setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const guild = interaction.guild
        if (!guild) {
            return interaction.reply({ content: "Use this command in a server.", ephemeral: true })
        }
        const member = guildMemberFromInteraction(interaction)
        if (!member) {
            return interaction.reply({
                content: "Could not resolve your member profile. Try again.",
                ephemeral: true,
            })
        }

        const voiceChannel = member.voice.channel
        if (!voiceChannel) {
            return interaction.reply({ content: "Join a voice channel first!", ephemeral: true })
        }

        const query = interaction.options.getString("query", true)

        if (isBlockedUserMediaUrl(query)) {
            return interaction.reply({
                content: USER_MEDIA_URL_BLOCKED,
                ephemeral: true,
            })
        }

        const player = client.lavalink.getPlayer(guild.id)

        if (!player) {
            return interaction.reply({
                content: "No player found for this guild.",
                ephemeral: true,
            })
        }

        const botMember = await guild.members.fetchMe()
        if (!botMember.voice.channel || botMember.voice.channel.id !== voiceChannel.id) {
            return interaction.reply({
                content: "You must be in the same voice channel as the bot to use this command.",
                ephemeral: true,
            })
        }

        await interaction.deferReply({ ephemeral: true })

        // Hold a lifecycle reservation across search → enqueue so queueEnd/orphan idle
        // destroy cannot tear down the player mid-search (unlike /play, this path previously
        // had no reservation and could enqueue onto a destroyed Player after a false success).
        return withGuildPlayerLifecycleReservation(guild.id, async () => {
            const searchPlayer = client.lavalink.getPlayer(guild.id)
            if (!isSameLivePlayer(searchPlayer, player)) {
                return interaction.editReply({
                    content: "The player was replaced. Try again.",
                })
            }

            let res
            try {
                res = await searchPlayer.search(query, { requester: interaction.user })
            } catch (e: unknown) {
                client.error("[PlayNextCmd] search failed:", e)
                return interaction.editReply({
                    content: "Search failed. Try again in a moment.",
                })
            }

            if (!res || !res.tracks?.length) {
                return interaction.editReply({
                    content: "No tracks found or an error occurred.",
                })
            }

            if (res.loadType === "playlist") {
                return interaction.editReply({
                    content: "Playlists are not supported for this command.",
                })
            }

            const track = res.tracks[0]
            const outcome = await enqueuePlayNextTrackAssumingSearchDone(
                () => {
                    const live = client.lavalink.getPlayer(guild.id)
                    return isSameLivePlayer(live, player) ? live : undefined
                },
                guild.id,
                track,
                interaction.user.id
            )
            if (outcome === "no_player") {
                return interaction.editReply({
                    content: "The player stopped before the track could be queued. Try again.",
                })
            }
            return interaction.editReply(
                `Added [${track.info.title}](${track.info.uri}) to the top of the queue.`
            )
        })
    },
}
