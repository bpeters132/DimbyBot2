import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction, Message } from "discord.js"
import { discordDeleteErrorDetails } from "../../util/discordErrorDetails.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"
import {
    stopLocalPlayer,
    getLocalPlayerState,
    cancelPendingLocalPlay,
    isPendingLocalPlay,
} from "../../util/localPlayer.js"
import {
    memberMayJoinOccupiedVoice,
    resolveOccupiedVoiceChannelId,
} from "../../util/sameVoiceChannel.js"
import { destroyLavalinkPlayerForStop } from "../../util/stopLavalinkPlayer.js"
import { resolveStopCommandReply } from "../../util/stopCommandReply.js"

export default {
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop the player and clear the queue"),
    /** Stops local and/or Lavalink playback and clears queue state for the guild. */
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

        // Require same VC (incl. local playback with no Lavalink player) so remote /stop
        // cannot wipe another channel's session.
        const lavalinkPlayer = client.lavalink.players.get(guild.id)
        const occupiedVoiceChannelId = resolveOccupiedVoiceChannelId(guild, lavalinkPlayer)
        if (!memberMayJoinOccupiedVoice(occupiedVoiceChannelId, voiceChannel.id)) {
            return interaction.reply({
                content: "You need to be in the same voice channel as the bot!",
                ephemeral: true,
            })
        }

        let stoppedLocal = false
        let stoppedLavalink = false
        /** Destroyed an idle Lavalink player (no current track / queue / playback). */
        let lavalinkIdleCleaned = false
        let lavalinkDestroyFailed = false
        let cancelledPendingLocal = false

        // Cancel in-flight local join before checking active local/Lavalink state so a Ready
        // wait after handoff cannot start audio after the user already asked to stop.
        if (isPendingLocalPlay(guild.id)) {
            cancelPendingLocalPlay(guild.id)
            cancelledPendingLocal = true
            client.debug(`[StopCmd] Cancelled pending local play for guild ${guild.id}`)
        }

        const localState = getLocalPlayerState(guild.id)
        const localPlayerWasActive = localState?.isPlaying || false
        if (localState != null) {
            if (stopLocalPlayer(client, guild.id)) {
                client.debug(`[StopCmd] Stopped local player for guild ${guild.id}`)
                stoppedLocal = true
            }
        }

        if (lavalinkPlayer) {
            const hadContent = Boolean(
                lavalinkPlayer.playing ||
                lavalinkPlayer.queue.current ||
                lavalinkPlayer.queue.tracks.length > 0
            )
            // Must await: floating destroy() rejections become unhandledRejection (process exit on Node 24).
            // Also ensures playerDestroy → clearPlayerSession bumps the session epoch before this
            // command continues (Leave/web stop already await).
            try {
                await destroyLavalinkPlayerForStop(lavalinkPlayer, () =>
                    client.lavalink.getPlayer(guild.id)
                )
                if (hadContent) {
                    client.debug(`[StopCmd] Destroyed Lavalink player for guild ${guild.id}`)
                    stoppedLavalink = true
                } else {
                    lavalinkIdleCleaned = true
                    client.debug(
                        `[StopCmd] Cleaned up inactive Lavalink player for guild ${guild.id}`
                    )
                }
            } catch (destroyErr: unknown) {
                lavalinkDestroyFailed = true
                client.error(
                    `[StopCmd] Failed to destroy Lavalink player for guild ${guild.id}:`,
                    destroyErr
                )
            }
        }

        // Destroy failures stay ephemeral; public confirm only when something actually stopped.
        const { content: replyContent, confirmPublicly: shouldConfirmPublicly } =
            resolveStopCommandReply({
                stoppedLocal,
                stoppedLavalink,
                lavalinkIdleCleaned,
                lavalinkDestroyFailed,
                cancelledPendingLocal,
                localPlayerWasActive,
            })

        let msg: Message<boolean> | undefined
        try {
            if (shouldConfirmPublicly) {
                msg = await interaction.reply({
                    content: replyContent,
                    fetchReply: true,
                })
            } else {
                await interaction.reply({
                    content: replyContent,
                    ephemeral: true,
                })
                return
            }
        } catch (replyErr: unknown) {
            client.error("[StopCmd] Failed to send reply:", replyErr)
            try {
                await interaction.followUp({
                    content: replyContent,
                    ephemeral: !shouldConfirmPublicly,
                })
            } catch (followErr: unknown) {
                client.error("[StopCmd] followUp after reply failure also failed:", followErr)
            }
            return
        }

        // Auto-delete reply only if something was actually stopped (public confirmation)
        if (shouldConfirmPublicly && msg) {
            setTimeout(() => {
                msg.delete().catch((e: unknown) => {
                    client.error("[StopCmd] Failed to delete reply (attempt 1):", e)
                    const d = discordDeleteErrorDetails(e)
                    if (d.code === "EAI_AGAIN" || d.message.includes("ECONNRESET")) {
                        setTimeout(() => {
                            msg.delete().catch((e2: unknown) =>
                                client.error("[StopCmd] Failed to delete reply (attempt 2):", e2)
                            )
                        }, 2000)
                    }
                })
            }, 5000) // 5 seconds delay for stop confirmation
        }
    },
}
