import { SlashCommandBuilder } from "discord.js"
import type { ChatInputCommandInteraction } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

export default {
    data: new SlashCommandBuilder()
        .setName("loop")
        .setDescription("Loop the currently playing song")
        .addStringOption((option) =>
            option
                .setName("mode")
                .setDescription("Loop mode")
                .setRequired(true)
                .addChoices(
                    { name: "Off", value: "off" },
                    { name: "Track", value: "track" },
                    { name: "Queue", value: "queue" }
                )
        ),

    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const guild = interaction.guild
        if (!guild) {
            return interaction.reply({ content: "Use this command in a server." })
        }
        const member = guildMemberFromInteraction(interaction)
        if (!member) {
            return interaction.reply({
                content: "Could not resolve your member profile. Try again.",
            })
        }

        const voiceChannel = member.voice.channel
        if (!voiceChannel) {
            return interaction.reply({ content: "Join a voice channel first!" })
        }

        const player = client.lavalink.players.get(guild.id)

        if (!player) {
            return interaction.reply({ content: "There is no player for this guild." })
        }

        if (player.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
            return interaction.reply({
                content: "You must be in the player's voice channel to change repeat mode.",
            })
        }

        if (!player.playing) {
            return interaction.reply({ content: "There is nothing playing." })
        }

        const mode = interaction.options.getString("mode", true)
        switch (mode) {
            case "off":
                await player.setRepeatMode("off")
                return interaction.reply({ content: "Looping disabled." })
            case "track":
                await player.setRepeatMode("track")
                return interaction.reply({ content: "Now looping the current track." })
            case "queue":
                await player.setRepeatMode("queue")
                return interaction.reply({ content: "Now looping the queue." })
            default:
                return interaction.reply({ content: "Invalid loop mode." })
        }
    },
}
