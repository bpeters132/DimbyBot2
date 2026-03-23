import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

export default {
    data: new SlashCommandBuilder()
        .setName("clearqueue")
        .setDescription(
            "Clears all upcoming tracks from the queue, leaving the current song playing."
        ),
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        if (!interaction.inGuild()) {
            // discord.js typings: the negated `inGuild()` branch is `never` for the default cache generic; widen so we can reply in DM/non-guild contexts.
            return (interaction as ChatInputCommandInteraction).reply({
                content: "Use this command in a server.",
                ephemeral: true,
            })
        }
        const guild = interaction.guild
        if (!guild) {
            return (interaction as ChatInputCommandInteraction).reply({
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
            client.debug("[ClearQueue] User not in a voice channel.")
            return interaction.reply({
                content: "Join a voice channel first!",
                ephemeral: true,
            })
        }

        // Check if bot is in a voice channel
        const botMember = await guild.members.fetchMe()
        if (!botMember.voice.channel) {
            client.debug("[ClearQueue] Bot not in a voice channel.")
            return interaction.reply({
                content: "I'm not in a voice channel!",
                ephemeral: true,
            })
        }

        // Check if user is in the same voice channel as the bot
        if (botMember.voice.channel.id !== voiceChannel.id) {
            client.debug("[ClearQueue] User not in the same voice channel as the bot.")
            return interaction.reply({
                content: "You must be in the same voice channel as me!",
                ephemeral: true,
            })
        }

        const player = client.lavalink.players.get(guild.id)

        if (!player) {
            client.debug("[ClearQueue] No player found for this guild.")
            return interaction.reply({
                content: "Nothing is playing right now.",
                ephemeral: true,
            })
        }

        if (player.queue.tracks.length === 0) {
            client.debug("[ClearQueue] Queue is already empty.")
            return interaction.reply({
                content: "The queue is already empty.",
                ephemeral: true,
            })
        }

        try {
            const queueSize = player.queue.tracks.length
            client.debug(
                `[ClearQueue] Clearing queue for guild ${guild.id}. Current size: ${queueSize}`
            )

            await player.queue.splice(0, queueSize)

            await interaction.reply({ content: `Cleared ${queueSize} tracks from the queue.` })
            client.debug(`[ClearQueue] Successfully cleared queue for guild ${guild.id}`)
        } catch (error) {
            client.error("[ClearQueue] Error clearing the queue:", error)
            await interaction.reply({
                content: "An error occurred while trying to clear the queue.",
                ephemeral: true,
            })
        }
    },
}
