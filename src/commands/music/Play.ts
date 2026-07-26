import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"
import { withGuildPlayerLifecycleReservation } from "../../util/guildPlayerQueueLock.js"
import { handleQueryAndPlay } from "../../util/musicManager.js"
import {
    memberMayJoinOccupiedVoice,
    resolveOccupiedVoiceChannelId,
} from "../../util/sameVoiceChannel.js"
import { webDashboardPromoAppend } from "../../util/webDashboardUrl.js"

export default {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Searches for and plays a song")
        .addStringOption((option) =>
            option.setName("query").setDescription("The song name or URL").setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const query = interaction.options.getString("query", true)
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

        // Check if user is in a voice channel
        const voiceChannel = member.voice.channel
        if (!voiceChannel) {
            return interaction.reply({ content: "Join a voice channel first!", ephemeral: true })
        }

        // Cover local @discordjs/voice playback (Lavalink player destroyed) and connected sessions.
        {
            const existingPlayer = client.lavalink.getPlayer(guild.id)
            const occupiedVoiceChannelId = resolveOccupiedVoiceChannelId(guild, existingPlayer)
            if (!memberMayJoinOccupiedVoice(occupiedVoiceChannelId, voiceChannel.id)) {
                return interaction.reply({
                    content: "You need to be in the same voice channel as the bot!",
                    ephemeral: true,
                })
            }
        }

        const textChannel = interaction.channel
        if (!textChannel?.isTextBased() || textChannel.isDMBased()) {
            return interaction.reply({
                content: "Use this command in a server text channel.",
                ephemeral: true,
            })
        }

        await interaction.deferReply()

        // Hold a lifecycle reservation across create + search so web orphan cleanup cannot
        // destroy the player while Discord /play is still resolving tracks.
        const { createdNewPlayer, result } = await withGuildPlayerLifecycleReservation(
            guild.id,
            async () => {
                let player = client.lavalink.getPlayer(guild.id)
                let createdNewPlayer = false

                if (!player) {
                    player = await client.lavalink.createPlayer({
                        guildId: guild.id,
                        voiceChannelId: voiceChannel.id,
                        textChannelId: interaction.channelId,
                        selfDeaf: true,
                        volume: 100,
                    })
                    createdNewPlayer = true
                }

                if (player.connected && player.voiceChannelId !== voiceChannel.id) {
                    return {
                        createdNewPlayer: false,
                        result: {
                            success: false,
                            feedbackText: "You need to be in the same voice channel as the bot!",
                        },
                    }
                }

                const result = await handleQueryAndPlay(
                    client,
                    guild.id,
                    voiceChannel,
                    textChannel,
                    query,
                    interaction.user,
                    player
                )
                return { createdNewPlayer, result }
            }
        )

        let replyText = result.feedbackText || "Something went wrong."
        if (createdNewPlayer && result.success) {
            replyText += webDashboardPromoAppend(guild.id)
        }

        await interaction.editReply(replyText)
    },
}
