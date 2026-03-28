import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"

import { rebalancePlayerQueueRoundRobin, toggleRRQ } from "../../util/rrqDisconnect.js"
import { updateControlMessage } from "../../events/handlers/handleControlChannel.js"

export default {
    data: new SlashCommandBuilder()
        .setName("roundrobin")
        .setDescription("Toggle round-robin queue mode (fair track ordering per user)"),

    /** Toggles round-robin queue for the guild player and refreshes the control message. */
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

        const voiceChannel = member.voice.channel
        if (!voiceChannel) {
            return interaction.reply({ content: "Join a voice channel first!", ephemeral: true })
        }

        const player = client.lavalink.getPlayer(guild.id)
        if (!player) {
            return interaction.reply({
                content: "There is no player for this guild.",
                ephemeral: true,
            })
        }

        if (player.connected && player.voiceChannelId !== voiceChannel.id) {
            return interaction.reply({
                content: "You need to be in the same voice channel as the bot!",
                ephemeral: true,
            })
        }

        const enabled = toggleRRQ(player)
        if (enabled) {
            await rebalancePlayerQueueRoundRobin(player)
        }

        await interaction.reply({
            content: enabled
                ? "Round-robin queue is now **enabled**."
                : "Round-robin queue is now **disabled**.",
        })

        try {
            await updateControlMessage(client, guild.id)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            client.warn(`[RoundRobin] updateControlMessage failed: ${msg}`)
        }
    },
}
