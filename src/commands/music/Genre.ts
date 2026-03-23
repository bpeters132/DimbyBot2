import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction, GuildMember } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

import { handleQueryAndPlay } from "../../util/musicManager.js"
import { seedAutoplayHistoryFromPlayer } from "../../util/autoplayHistory.js"

export default {
    data: new SlashCommandBuilder()
        .setName("genre")
        .setDescription("Search by genre or mood and enable autoplay")
        .addStringOption((option) =>
            option.setName("name").setDescription('e.g. "lo-fi", "metal", "jazz"').setRequired(true)
        ),

    /** Search by genre/mood, queue results, and enable autoplay. */
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const noMentions = { allowedMentions: { parse: [] } }

        const genreName = interaction.options.getString("name")?.trim()
        if (!genreName) {
            return interaction.reply({ content: "Please provide a genre name.", ...noMentions })
        }

        const guild = interaction.guild
        if (!guild) {
            return interaction.reply({
                content: "This command can only be used in a server.",
                ...noMentions,
            })
        }

        await interaction.deferReply()

        let member: GuildMember | null = guildMemberFromInteraction(interaction)
        if (!member) {
            try {
                member = await guild.members.fetch(interaction.user.id)
            } catch {
                return interaction.editReply({
                    content:
                        "Could not determine your member info—try again or re-run the command.",
                    ...noMentions,
                })
            }
        }

        if (!member?.voice?.channel) {
            return interaction.editReply({ content: "Join a voice channel first!", ...noMentions })
        }

        const voiceChannel = member.voice.channel

        let player = client.lavalink.getPlayer(guild.id)

        if (!player) {
            try {
                player = await client.lavalink.createPlayer({
                    guildId: guild.id,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: interaction.channelId,
                    selfDeaf: true,
                    volume: 100,
                })
            } catch (err) {
                client.error("[GenreCmd] createPlayer failed:", err)
                return interaction.editReply({
                    content: "Could not join voice right now. Try again in a moment.",
                    ...noMentions,
                })
            }
        }

        if (player.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
            return interaction.editReply({
                content: "You need to be in the same voice channel as the bot!",
                ...noMentions,
            })
        }

        const textChannel = interaction.channel
        if (!textChannel?.isTextBased() || textChannel.isDMBased()) {
            return interaction.editReply({
                content: "Use this command in a server text channel.",
                ...noMentions,
            })
        }

        const result = await handleQueryAndPlay(
            client,
            guild.id,
            voiceChannel,
            textChannel,
            genreName,
            interaction.user,
            player
        )

        if (result.success) {
            player.set("autoplay", true)
            seedAutoplayHistoryFromPlayer(player)
            await interaction.editReply({
                content: `Autoplay enabled for **${genreName}**. ${result.feedbackText ?? "Queued."}`,
                ...noMentions,
            })
        } else {
            await interaction.editReply({
                content: result.feedbackText || "Something went wrong.",
                ...noMentions,
            })
        }
    },
}
