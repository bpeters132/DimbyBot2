import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"
import { discordDeleteErrorDetails } from "../../util/discordErrorDetails.js"
import { getLivePlayerIfUnchanged } from "../../util/livePlayerIdentity.js"
import { skipCurrentTrack } from "../../util/skipCurrentTrack.js"

export default {
    data: new SlashCommandBuilder().setName("skip").setDescription("Skip the song"),
    /** Skips the current Lavalink track (or ends autoplay when the queue is empty). */
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
            return interaction.reply({
                content: "Join a voice channel first!",
                ephemeral: true,
            })
        }

        const player = client.lavalink.getPlayer(guild.id)

        if (!player) {
            return interaction.reply({ content: "Nothing is playing.", ephemeral: true })
        }

        if (player.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
            return interaction.reply({
                content: "You need to be in the same voice channel as the bot!",
                ephemeral: true,
            })
        }

        const hasCurrent = !!player.queue.current
        const hasQueued = player.queue.tracks.length > 0

        if (!hasCurrent && !hasQueued) {
            return interaction.reply({ content: "Nothing is playing.", ephemeral: true })
        }

        await interaction.deferReply()

        // deferReply can outlive /stop+/play; Player.skip is guild-keyed on the node, so a
        // zombie reference would skip the successor's track. Refuse when identity changed.
        const live = getLivePlayerIfUnchanged(() => client.lavalink.getPlayer(guild.id), player)
        if (!live) {
            return interaction.editReply({
                content: "The player stopped before the skip finished. Try again.",
            })
        }

        const liveHasCurrent = !!live.queue.current
        const liveHasQueued = live.queue.tracks.length > 0
        if (!liveHasCurrent && !liveHasQueued) {
            return interaction.editReply({ content: "Nothing is playing." })
        }

        try {
            const skipped = await skipCurrentTrack(live)
            if (skipped === "deferred") {
                return interaction.editReply({
                    content:
                        "Could not skip right now. The next track is still preparing. Try again in a moment.",
                })
            }
        } catch (e) {
            client.error("[SkipCmd] skip failed:", e)
            return interaction.editReply({
                content: "Could not skip right now. Try again in a moment.",
            })
        }

        const msg = await interaction.editReply({ content: "Skipped!" })
        setTimeout(() => {
            msg.delete().catch((e: unknown) => {
                const d1 = discordDeleteErrorDetails(e)
                client.error("[SkipCmd] Failed to delete reply (attempt 1):", e)
                if (d1.code === "EAI_AGAIN" || d1.message.includes("ECONNRESET")) {
                    setTimeout(() => {
                        msg.delete().catch((e2: unknown) => {
                            client.error("[SkipCmd] Failed to delete reply (attempt 2):", e2)
                        })
                    }, 2000)
                }
            })
        }, 1000 * 10)
    },
}
