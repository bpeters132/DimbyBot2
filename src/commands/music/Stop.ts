import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction, Message } from "discord.js"
import { discordDeleteErrorDetails } from "../../util/discordErrorDetails.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"
import { stopLocalPlayer, getLocalPlayerState } from "../../util/localPlayer.js"
import {
    memberMayJoinOccupiedVoice,
    resolveOccupiedVoiceChannelId,
} from "../../util/sameVoiceChannel.js"

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

        const localState = getLocalPlayerState(guild.id)
        const localPlayerWasActive = localState?.isPlaying || false
        if (localState != null) {
            if (stopLocalPlayer(client, guild.id)) {
                client.debug(`[StopCmd] Stopped local player for guild ${guild.id}`)
                stoppedLocal = true
            }
        }

        if (lavalinkPlayer) {
            // Await destroy so playerDestroy → clearPlayerSession bumps the session epoch
            // before this command continues. Fire-and-forget destroy lets Lavalink delete the
            // old player from the map mid-teardown, a successor /play create a new player, then
            // the late playerDestroy clear wipe that new session (Leave/web stop already await).
            const wasActive =
                lavalinkPlayer.playing ||
                Boolean(lavalinkPlayer.queue.current) ||
                lavalinkPlayer.queue.tracks.length > 0
            try {
                await lavalinkPlayer.destroy()
                if (wasActive) {
                    client.debug(`[StopCmd] Destroyed Lavalink player for guild ${guild.id}`)
                    stoppedLavalink = true
                } else {
                    lavalinkIdleCleaned = true
                    client.debug(
                        `[StopCmd] Cleaned up inactive Lavalink player for guild ${guild.id}`
                    )
                }
            } catch (error: unknown) {
                client.error(
                    `[StopCmd] Failed to destroy Lavalink player for guild ${guild.id}:`,
                    error
                )
                return interaction.reply({
                    content: "An error occurred while trying to stop playback.",
                    ephemeral: true,
                })
            }
        }

        let replyContent = "Nothing was playing."
        if (stoppedLocal && stoppedLavalink) {
            replyContent = "All playback stopped and the queue was cleared."
        } else if (stoppedLocal && lavalinkIdleCleaned) {
            replyContent = "Local playback stopped and idle Lavalink resources were cleaned up."
        } else if (stoppedLocal) {
            replyContent = "Local playback stopped."
        } else if (stoppedLavalink) {
            replyContent = "Lavalink playback stopped and the queue was cleared."
        } else if (lavalinkIdleCleaned) {
            replyContent = "Lavalink player was idle; resources cleaned up."
        } else if (localPlayerWasActive && !stoppedLocal) {
            replyContent = "Could not stop the local player. Please check logs."
        }

        const stoppedSomething = stoppedLocal || stoppedLavalink || lavalinkIdleCleaned

        let msg: Message<boolean> | undefined
        try {
            if (stoppedSomething) {
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
                    ephemeral: !stoppedSomething,
                })
            } catch (followErr: unknown) {
                client.error("[StopCmd] followUp after reply failure also failed:", followErr)
            }
            return
        }

        // Auto-delete reply only if something was actually stopped (public confirmation)
        if (stoppedSomething && msg) {
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
