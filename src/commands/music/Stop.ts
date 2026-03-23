import { SlashCommandBuilder } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction, Message } from "discord.js"
import { stopLocalPlayer, getLocalPlayerState } from "../../util/localPlayer.js"

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

        let stoppedLocal = false
        let stoppedLavalink = false

        const localState = getLocalPlayerState(guild.id)
        const localPlayerWasActive = localState?.isPlaying || false
        if (localState != null) {
            if (stopLocalPlayer(client, guild.id)) {
                client.debug(`[StopCmd] Stopped local player for guild ${guild.id}`)
                stoppedLocal = true
            }
        }

        // Attempt to stop Lavalink player
        const lavalinkPlayer = client.lavalink.players.get(guild.id)
        if (lavalinkPlayer) {
            // Check if it was actually doing something or had a queue
            if (
                lavalinkPlayer.playing ||
                lavalinkPlayer.queue.current ||
                lavalinkPlayer.queue.tracks.length > 0
            ) {
                lavalinkPlayer.destroy()
                client.debug(`[StopCmd] Destroyed Lavalink player for guild ${guild.id}`)
                stoppedLavalink = true
            } else {
                // If Lavalink player exists but isn't active and has no queue, still destroy to clean up resources if desired,
                // or just note it wasn't actively playing.
                lavalinkPlayer.destroy()
                client.debug(`[StopCmd] Cleaned up inactive Lavalink player for guild ${guild.id}`)
            }
        }

        let replyContent = "Nothing was playing."
        if (stoppedLocal && stoppedLavalink) {
            replyContent = "All playback stopped and the queue was cleared."
        } else if (stoppedLocal) {
            replyContent = "Local playback stopped."
        } else if (stoppedLavalink) {
            replyContent = "Lavalink playback stopped and the queue was cleared."
        } else if (localPlayerWasActive && !stoppedLocal) {
            replyContent = "Could not stop the local player. Please check logs."
        }

        const stoppedSomething = stoppedLocal || stoppedLavalink

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
                    const err = e as { code?: string; message?: string }
                    client.error("[StopCmd] Failed to delete reply (attempt 1):", e)
                    if (err.code === "EAI_AGAIN" || err.message?.includes("ECONNRESET")) {
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
