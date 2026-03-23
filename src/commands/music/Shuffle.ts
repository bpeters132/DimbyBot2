import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

export default {
    data: new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the current queue"),
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const guild = interaction.guild
        if (!interaction.inGuild() || guild === null) {
            return await interaction.reply({
                content: "Use this command in a server.",
                ephemeral: true,
            })
        }
        const member = guildMemberFromInteraction(interaction)
        if (!member) {
            return await interaction.reply({
                content: "Could not resolve your member profile. Try again.",
                ephemeral: true,
            })
        }

        const voiceChannel = member.voice.channel
        if (!voiceChannel) {
            return await interaction.reply({
                content: "Join a voice channel first!",
                ephemeral: true,
            })
        }

        const player = client.lavalink.players.get(guild.id)

        if (player && player.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
            return await interaction.reply({
                content: "You must be in the same voice channel as the bot to use this command.",
                ephemeral: true,
            })
        }

        if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
            return await interaction.reply({ content: "Nothing is playing.", ephemeral: true })
        } else if (player.queue.current && player.queue.tracks.length === 0) {
            return await interaction.reply({
                content: "The last song in the queue is already playing!",
                ephemeral: true,
            })
        }

        await player.queue.shuffle()
        await interaction.reply("Queue shuffled.")
    },
}
