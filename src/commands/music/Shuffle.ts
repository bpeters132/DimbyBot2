import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

export default {
    data: new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the current queue"),
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const guild = interaction.guild
        if (!guild) {
            return await interaction.reply({ content: "Use this command in a server." })
        }
        const member = guildMemberFromInteraction(interaction)
        if (!member) {
            return await interaction.reply({
                content: "Could not resolve your member profile. Try again.",
            })
        }

        const voiceChannel = member.voice.channel
        if (!voiceChannel) {
            return await interaction.reply({ content: "Join a voice channel first!" })
        }

        const player = client.lavalink.players.get(guild.id)

        if (player && player.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
            return await interaction.reply({
                content: "You must be in the same voice channel as the bot to use this command.",
            })
        }

        if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
            return await interaction.reply("Nothing is playing.")
        } else if (player.queue.current && player.queue.tracks.length === 0) {
            return await interaction.reply("The last song in the queue is already playing!")
        }

        await player.queue.shuffle()
        await interaction.reply("Queue shuffled.")
    },
}
