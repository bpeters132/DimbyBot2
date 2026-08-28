import { SlashCommandBuilder, type Message } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { ChatInputCommandInteraction } from "discord.js"
import { guildMemberFromInteraction } from "../../util/guildMember.js"
import { stopLocalPlayer, getLocalPlayerState } from "../../util/localPlayer.js"
import {
    forceClearPlayerSession,
    forceClearPlayerSessionAfterDestroyIfSafe,
} from "../../util/playerSessionPersistence.js"
import {
    shouldDisconnectOrphanVoice,
    shouldTearDownAbsentLavalinkOnLeave,
} from "../../util/leaveOrphanVoice.js"
import {
    memberMayJoinOccupiedVoice,
    resolveOccupiedVoiceChannelId,
} from "../../util/sameVoiceChannel.js"

const DELETE_REPLY_DELAY_MS = 1000 * 10
const DELETE_REPLY_RETRY_MS = 2000

/** Deletes the deferred reply after a delay, with one network retry on transient errors. */
function deleteWithRetry(msg: Message, client: BotClient) {
    setTimeout(() => {
        msg.delete().catch((e: unknown) => {
            client.error("[LeaveCmd] Failed to delete reply (attempt 1):", e)
            const err = e as { code?: string; message?: string }
            if (err.code === "EAI_AGAIN" || err.message?.includes("ECONNRESET")) {
                setTimeout(() => {
                    msg.delete().catch((e2: unknown) =>
                        client.error("[LeaveCmd] Failed to delete reply (attempt 2):", e2)
                    )
                }, DELETE_REPLY_RETRY_MS)
            }
        })
    }, DELETE_REPLY_DELAY_MS)
}

export default {
    data: new SlashCommandBuilder().setName("leave").setDescription("Tell the bot to leave"),
    /**
     * Disconnects the bot from voice and tears down Lavalink and/or local playback.
     * Force-clears the persisted session so a mid-restore leave cannot resurrect the queue.
     */
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        const guild = interaction.guild
        if (!guild) {
            return interaction.reply({ content: "Use this command in a server." })
        }
        client.debug(`Leave command invoked by ${interaction.user.tag} in guild ${guild.id}`)
        const member = guildMemberFromInteraction(interaction)
        if (!member) {
            return interaction.reply({
                content: "Could not resolve your member profile. Try again.",
            })
        }

        const voiceChannel = member.voice.channel
        if (!voiceChannel) {
            client.debug("Leave command failed: User not in a voice channel")
            return interaction.reply({
                content: "Join a voice channel first!",
                ephemeral: true,
            })
        }

        client.debug(`User ${interaction.user.tag} is in voice channel ${voiceChannel.id}`)

        const player = client.lavalink.players.get(guild.id)
        // Prefer live Discord VC so local (@discordjs/voice) playback is gated correctly
        // when the Lavalink player was destroyed for handoff.
        const occupiedVoiceChannelId = resolveOccupiedVoiceChannelId(guild, player)
        if (!memberMayJoinOccupiedVoice(occupiedVoiceChannelId, voiceChannel.id)) {
            return interaction.reply({
                content: "You need to be in the same voice channel as the bot!",
                ephemeral: true,
            })
        }

        await interaction.deferReply()

        let stoppedLocal = false
        const localState = getLocalPlayerState(guild.id)
        if (localState != null) {
            if (stopLocalPlayer(client, guild.id)) {
                client.debug(`[LeaveCmd] Stopped local player for guild ${guild.id}`)
                stoppedLocal = true
            }
        }

        if (!player) {
            client.debug(
                `Leave command check: No Lavalink player for guild ${guild.id}. Checking bot voice / local cleanup.`
            )
            const botVoiceState = guild.members.me?.voice
            if (stoppedLocal || botVoiceState?.channel) {
                try {
                    // Re-read: concurrent /play can install a successor after the null check.
                    const liveNow = client.lavalink.getPlayer(guild.id)
                    if (shouldTearDownAbsentLavalinkOnLeave(liveNow)) {
                        // May return undefined when no player exists — do not call .catch on it.
                        await client.lavalink.destroyPlayer(guild.id)
                        if (shouldDisconnectOrphanVoice(false, Boolean(botVoiceState?.channel))) {
                            await botVoiceState?.disconnect()
                        }
                        // No live player — safe to drop any leftover local-handoff session row.
                        await forceClearPlayerSession(guild.id)
                    } else {
                        client.debug(
                            `Leave: skipping Lavalink teardown for guild ${guild.id}; successor player already live`
                        )
                    }
                    await interaction.editReply({ content: "Left the voice channel." })
                    const msg = await interaction.fetchReply()
                    client.debug("Successfully left voice channel (local and/or orphan VC).")
                    deleteWithRetry(msg, client)
                } catch (error) {
                    client.error(
                        "Error trying to leave voice channel without active Lavalink player:",
                        error
                    )
                    await interaction.editReply(
                        "Couldn't leave the channel cleanly. Please disconnect me manually."
                    )
                }
            } else {
                client.debug("Bot is not in a voice channel. Replying 'nothing to leave'.")
                await interaction.editReply({
                    content: "I'm not in a voice channel!",
                })
            }
            return
        }

        client.debug(
            `Found player for guild ${guild.id}. Connected: ${player.connected}, Playing: ${player.playing}`
        )

        client.debug(`Destroying player for guild ${guild.id}`)
        try {
            await player.destroy()
            // playerDestroy → clearPlayerSession is skipped while restore-in-progress;
            // force-clear so an intentional leave cannot resurrect on the next reconnect.
            // Skip when a successor was created during destroy (cache-delete window).
            await forceClearPlayerSessionAfterDestroyIfSafe(
                guild.id,
                player,
                client.lavalink.getPlayer(guild.id)
            )
            client.debug(`Player destroyed for guild ${guild.id}`)
            await interaction.editReply({ content: "BYE!" })
            const msg = await interaction.fetchReply()
            client.debug("Leave command successfully executed")
            deleteWithRetry(msg, client)
        } catch (error) {
            client.error(`Error destroying player for guild ${guild.id}:`, error)
            await interaction.editReply("An error occurred while trying to leave.")
        }
    },
}
