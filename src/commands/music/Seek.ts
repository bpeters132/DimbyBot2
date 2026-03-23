import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

export default {
    data: new SlashCommandBuilder()
        .setName("seek")
        .setDescription("Seek through the currently playing song")
        .addIntegerOption((option) =>
            option
                .setName("position")
                .setDescription("Time to seek to (seconds)")
                .setRequired(true)
                .setMinValue(0)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const position = interaction.options.getInteger("position", true)
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

        const player = client.lavalink.players.get(guild.id)

        if (!player || !player.queue.current) {
            return interaction.reply({ content: "Nothing is playing.", ephemeral: true })
        }

        const current = player.queue.current

        const durationMs = current.info.duration ?? 0
        const durationSec = Math.max(0, Math.floor(durationMs / 1000))
        if (durationSec > 0 && position > durationSec) {
            return interaction.reply({
                content: `That position is past the end of the track (~${durationSec}s).`,
                ephemeral: true,
            })
        }

        const seekMs = Math.min(
            Math.max(0, position * 1000),
            durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER
        )
        await player.seek(seekMs)
        await interaction.reply("Seek complete.")
    },
}
