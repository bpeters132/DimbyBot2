import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

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

        const res = await player.search(query, { requester: interaction.user })

        if (!res || !res.tracks?.length) {
            return interaction.reply({
                content: "No tracks found or an error occurred.",
                ephemeral: true,
            })
        }

        if (res.loadType === "playlist") {
            return interaction.reply({
                content: "Playlists are not supported for this command.",
                ephemeral: true,
            })
        }

        await interaction.deferReply()

        const track = res.tracks[0]
        player.queue.add(track, 0)
        return interaction.editReply(
            `Added [${track.info.title}](${track.info.uri}) to the top of the queue.`
        )
    },
}
